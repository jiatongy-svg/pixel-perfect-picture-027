"use client";
// ============================================================================
// Accept / Counter / Decline for one proposal. Every button sends the version
// number the user is looking at; the database rejects it if that version is
// no longer current ("This proposal changed. Refresh to see the latest version.").
// Buttons are disabled while a request is in flight, so double-clicks do nothing.
// ============================================================================
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, RefreshCw } from "lucide-react";
import { acceptProposal, counterProposal, declineProposal } from "@/app/actions";
import { Button, Card, Field, Notice, inputClass } from "@/components/ui";

type Props = {
  proposalId: string;
  version: number;
  iAccepted: boolean;
  current: { destinationId: string; start: string; end: string };
  destinationOptions: { id: string; name: string }[];
  window: { start: string; end: string } | null;
};

export function ProposalActions({ proposalId, version, iAccepted, current, destinationOptions, window }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"idle" | "counter" | "decline">("idle");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string; conflicts?: string[]; stale?: boolean } | null>(null);
  const [c, setC] = useState({ ...current, note: "" });
  const [fields, setFields] = useState<Record<string, string>>({});

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string; conflicts?: string[]; fields?: Record<string, string> }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMode("idle");
        setFields({});
        setMsg({ tone: "success", text: r.message ?? "Done." });
        router.refresh();
      } else {
        setFields(r.fields ?? {});
        setMsg({ tone: "error", text: r.error ?? "Something went wrong.", conflicts: r.conflicts, stale: r.error?.includes("Refresh") });
      }
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Your response to version {version}</h2>
      {msg && (
        <Notice tone={msg.tone} title={msg.text}
          action={msg.stale && <Button size="sm" variant="secondary" onClick={() => { setMsg(null); router.refresh(); }}><RefreshCw aria-hidden className="size-4" /> Refresh</Button>}>
          {msg.conflicts && <ul className="list-disc pl-4">{msg.conflicts.map((x) => <li key={x}>{x}</li>)}</ul>}
        </Notice>
      )}

      {mode === "idle" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {iAccepted ? (
            <p className="flex h-11 flex-1 items-center gap-2 rounded-md bg-success-bg px-3 text-sm font-medium text-success-text"><Check aria-hidden className="size-4" /> You accepted v{version}. Waiting on the others.</p>
          ) : (
            <Button className="sm:flex-1" loading={pending} onClick={() => run(() => acceptProposal(proposalId, version))}>Accept v{version}</Button>
          )}
          <Button variant="secondary" disabled={pending} onClick={() => { setMsg(null); setMode("counter"); }}>Counter</Button>
          <Button variant="danger" disabled={pending} onClick={() => { setMsg(null); setMode("decline"); }}>Decline</Button>
        </div>
      )}

      {mode === "decline" && (
        <div className="flex flex-col gap-3 rounded-md border border-danger p-3">
          <p className="text-sm">Decline ends this proposal for everyone on it. You can still propose again later from Matches.</p>
          <div className="flex gap-2">
            <Button variant="danger" loading={pending} onClick={() => run(() => declineProposal(proposalId, version))}>Yes, decline</Button>
            <Button variant="ghost" disabled={pending} onClick={() => setMode("idle")}>Cancel</Button>
          </div>
        </div>
      )}

      {mode === "counter" && (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run(() => counterProposal({ proposalId, version, destinationId: c.destinationId, start: c.start, end: c.end, note: c.note })); }}>
          <p className="text-sm text-muted">A counter creates version {version + 1}. Everyone, including you, must accept the new version. It can't break anyone's fixed dates or destination.</p>
          <Field id="c-dest" label="Destination" error={fields.destinationId}>
            <select id="c-dest" className={inputClass} value={c.destinationId} onChange={(e) => setC({ ...c, destinationId: e.target.value })}>
              {destinationOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="c-start" label="Start" error={fields.start}>
              <input id="c-start" type="date" className={inputClass} min={window?.start} max={window?.end} value={c.start} onChange={(e) => setC({ ...c, start: e.target.value })} />
            </Field>
            <Field id="c-end" label="End" error={fields.end}>
              <input id="c-end" type="date" className={inputClass} min={c.start || window?.start} max={window?.end} value={c.end} onChange={(e) => setC({ ...c, end: e.target.value })} />
            </Field>
          </div>
          <Field id="c-note" label="Note to the group" optional error={fields.note}>
            <input id="c-note" className={inputClass} maxLength={300} value={c.note} placeholder="One night shorter so I'm back for Monday class?" onChange={(e) => setC({ ...c, note: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={pending}>Send version {version + 1}</Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setMode("idle")}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
