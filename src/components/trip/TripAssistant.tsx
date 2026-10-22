import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Send, X } from "lucide-react";
import { askAssistant } from "@/lib/assistant.functions";
import { appGuide, type AssistantMessage } from "@/lib/assistant";

export function TripAssistant({ context = "" }: { context?: string | undefined }) {
  const ask = useServerFn(askAssistant);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"ai" | "guide" | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, busy]);
  async function send(text: string) {
    if (busy || !text.trim()) return;
    const next: AssistantMessage[] = [...messages, { role: "user", content: text.trim().slice(0, 1000) }];
    setMessages(next); setDraft(""); setBusy(true);
    try {
      const result = await ask({ data: { messages: next.slice(-12), context: context.slice(0, 1200) } });
      setMessages([...next, { role: "assistant", content: result.reply }]); setMode(result.mode);
    } catch {
      setMessages([...next, { role: "assistant", content: appGuide(text) }]); setMode("guide");
    } finally { setBusy(false); }
  }
  return <>
    <button aria-label="Open trip assistant" aria-expanded={open} aria-controls="trip-assistant" onClick={() => setOpen(!open)} className="fixed right-4 bottom-4 z-40 flex h-12 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><MessageCircle size={19} />Trip assistant</button>
    {open && <section id="trip-assistant" role="dialog" aria-label="Trip assistant" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} className="fixed right-3 bottom-20 z-50 flex h-[min(560px,calc(100dvh-110px))] w-[min(390px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <header className="flex items-center justify-between border-b border-border p-4"><div><h2 className="font-bold">Trip assistant</h2><p className="text-xs text-muted-foreground">Trip ideas and help using TripMatch</p></div><button aria-label="Close trip assistant" onClick={() => setOpen(false)} className="rounded-lg p-2"><X size={20} /></button></header>
      <div ref={list} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4">
        {!messages.length && <><p className="text-sm">What would you like help with?</p><div className="flex flex-wrap gap-2">{["How do matches work?", "Tokyo ideas", "How does MBTI work?"].map((prompt) => <button key={prompt} onClick={() => void send(prompt)} className="rounded-xl border border-border px-3 py-2 text-left text-sm">{prompt}</button>)}</div></>}
        {messages.map((message, index) => <div key={index} className={`whitespace-pre-wrap break-words rounded-xl p-3 text-sm ${message.role === "user" ? "ml-8 bg-secondary" : "mr-3 bg-muted"}`}><span className="mb-1 block text-xs font-semibold">{message.role === "user" ? "You" : "Trip assistant"}</span>{message.content}</div>)}
        {busy && <p role="status" className="text-sm text-muted-foreground">Thinking…</p>}
      </div>
      <p className="px-4 pb-2 text-xs text-muted-foreground">{mode === "guide" ? "App guide mode. AI is unavailable right now." : "Suggestions only. No bookings or live prices."} Don’t share passwords or private details.</p>
      <form className="flex gap-2 border-t border-border p-3" onSubmit={(event) => { event.preventDefault(); void send(draft); }}><input ref={input} aria-label="Message trip assistant" value={draft} maxLength={1000} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about your trip…" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" /><button aria-label="Send to trip assistant" disabled={busy || !draft.trim()} className="rounded-xl bg-primary p-3 text-primary-foreground disabled:opacity-40"><Send size={18} /></button></form>
    </section>}
  </>;
}
