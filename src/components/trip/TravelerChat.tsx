import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listTripMessages, sendTripMessage } from "@/lib/messages.functions";

type Message = { id: string; name: string; body: string; created_at: string };
export function TravelerChat({ proposalId, sample }: { proposalId: string; sample: boolean }) {
  const load = useServerFn(listTripMessages);
  const send = useServerFn(sendTripMessage);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ text: string; id: string } | null>(null);
  const storageKey = `tm_demo_chat_${proposalId}`;
  useEffect(() => {
    if (!open) return;
    let active = true;
    if (sample) {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        setMessages(Array.isArray(stored) ? stored.filter((item): item is Message => !!item && typeof item.id === "string" && typeof item.name === "string" && typeof item.body === "string" && typeof item.created_at === "string").slice(-100) : []);
      } catch { setMessages([]); }
      return;
    }
    const refresh = async () => {
      if (document.hidden) return;
      try { const result = await load({ data: { proposalId } }); if (active) { setMessages(result.messages); setError(null); } }
      catch { if (active) setError("Private chat needs verified sign-in and the team’s chat database update."); }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [open, sample, proposalId, storageKey, load]);
  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true); setError(null);
    const request = pending?.text === text ? pending : { text, id: crypto.randomUUID() };
    setPending(request);
    try {
      if (sample) {
        const next = [...messages, { id: request.id, name: "You (demo)", body: text, created_at: new Date().toISOString() }].slice(-100);
        localStorage.setItem(storageKey, JSON.stringify(next)); setMessages(next);
      } else {
        await send({ data: { proposalId, body: text, clientId: request.id } });
        setDraft(""); setPending(null);
        try { const result = await load({ data: { proposalId } }); setMessages(result.messages); }
        catch { setError("Your message was sent, but the conversation could not refresh. Try reopening chat."); }
      }
      if (sample) { setDraft(""); setPending(null); }
    } catch { setError("Message was not sent. Check verified sign-in and the chat database connection, then retry."); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 rounded-2xl border border-border bg-card p-4" aria-label="Traveler chat">
    <button className="flex w-full items-center justify-between text-left font-bold" aria-expanded={open} onClick={() => setOpen(!open)}>Chat with travelers <span>{open ? "−" : "+"}</span></button>
    {open && <>
      <p className="mt-2 text-xs text-muted-foreground">{sample ? "Demo chat only. These are sample profiles. Messages stay on this device and no one receives them." : "Private chat with the people in this plan. Updates every 10 seconds."}</p>
      <div role="log" aria-live="polite" className="mt-3 max-h-64 space-y-2 overflow-y-auto">{!messages.length && <p className="text-sm text-muted-foreground">{sample ? "Try writing a demo message." : "No messages loaded yet."}</p>}{messages.map((message) => <div key={message.id} className="break-words rounded-xl bg-muted p-3 text-sm"><span className="block text-xs font-semibold">{message.name}</span>{message.body}</div>)}</div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <form className="mt-3 flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}><textarea aria-label="Message travelers" rows={2} maxLength={1000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Discuss your trip…" className="w-full rounded-xl border border-border bg-background p-3 text-sm" /><button disabled={busy || !draft.trim()} className="rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-40">{busy ? "Saving…" : sample ? "Save demo message" : "Send message"}</button></form>
    </>}
  </section>;
}
