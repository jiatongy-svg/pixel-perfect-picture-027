"use client";
// ============================================================================
// The group chat. Simple on purpose: it checks for new messages every few
// seconds (no extra services). Only trip members can read or post — the
// database enforces that, not just this screen.
// ============================================================================
import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { getMessages, sendMessage, type ChatMessage } from "@/app/actions";
import { TRIPS } from "@/lib/constants";
import { Button, Notice, cx, inputBase } from "@/components/ui";

const time = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

export function TripChat({ tripId, initial, prompts }: { tripId: string; initial: ChatMessage[]; prompts: string[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);
  const lastId = messages[messages.length - 1]?.id ?? 0;

  // Check for new messages every few seconds while the page is open.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const fresh = await getMessages(tripId, lastId).catch(() => []);
      if (!stop && fresh.length) setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
    };
    const t = setInterval(tick, TRIPS.chatPollMs);
    return () => { stop = true; clearInterval(t); };
  }, [tripId, lastId]);

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  function send(text: string) {
    const body = text.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      const r = await sendMessage(tripId, body);
      if (!r.ok) return setError(r.error);
      setDraft("");
      const fresh = await getMessages(tripId, lastId).catch(() => []);
      setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ol ref={listRef} aria-live="polite" aria-label="Messages" className="flex max-h-96 min-h-32 flex-col gap-2 overflow-y-auto rounded-md bg-surface-sunken p-3">
        {messages.length === 0 && <li className="m-auto text-center text-sm text-muted">No messages yet. Say hi and start with the checklist below.</li>}
        {messages.map((m) => (
          <li key={m.id} className={cx("flex max-w-[85%] flex-col", m.mine ? "self-end items-end" : "self-start items-start")}>
            <span className="text-xs text-muted">{m.mine ? "You" : m.name} · {time(m.at)}</span>
            <span className={cx("rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap", m.mine ? "bg-accent text-on-accent" : "bg-surface-raised text-text shadow-sm")}>{m.body}</span>
          </li>
        ))}
      </ol>
      {prompts.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Conversation starters">
          {prompts.map((p) => (
            <button key={p} type="button" onClick={() => setDraft(p)}
              className="rounded-full border border-border-interactive bg-surface-raised px-3 py-1 text-xs transition-colors duration-150 hover:bg-surface-hover active:bg-surface-active">{p}</button>
          ))}
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
        <label htmlFor="chat-input" className="sr-only">Message</label>
        <input id="chat-input" className={`${inputBase} flex-1`} maxLength={TRIPS.maxMessage} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message" autoComplete="off" />
        <Button type="submit" loading={pending} disabled={!draft.trim()} aria-label="Send"><Send aria-hidden className="size-4" /></Button>
      </form>
    </div>
  );
}
