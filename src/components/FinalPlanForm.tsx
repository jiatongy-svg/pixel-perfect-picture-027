"use client";
// ============================================================================
// The checklist that locks in the plan, filled in by one member after the chat:
//   1. Exact dates (must be confirmed)
//   2. Do we want more people? If yes, how many more?
//   3. When do sign-ups close?
// Sending it creates the final version; everyone else then taps Accept.
// If the group wants more people, the trip goes to Discover once accepted.
// ============================================================================
import { useState, useTransition } from "react";
import { acceptProposal, submitFinalPlan } from "@/app/actions";
import { TRIPS } from "@/lib/constants";
import { Button, Field, Group, Notice, OptionCard, inputBase, inputClass } from "@/components/ui";

type Props = {
  tripId: string;
  version: number;
  current: { destinationId: string; start: string; end: string };
  destinationOptions: { id: string; name: string }[];
  window: { start: string; end: string } | null;
};

export function FinalPlanForm({ tripId, version, current, destinationOptions, window }: Props) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({ ...current, wantMore: false, extraSpots: 1, joinDeadline: "", note: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string; conflicts?: string[] } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function submit() {
    setMsg(null);
    start(async () => {
      const r = await submitFinalPlan({ proposalId: tripId, version, destinationId: f.destinationId, start: f.start, end: f.end, wantMore: f.wantMore, extraSpots: f.extraSpots, joinDeadline: f.joinDeadline || null, note: f.note });
      if (!r.ok) {
        setFields(r.fields ?? {});
        setMsg({ tone: "error", text: r.error, conflicts: r.conflicts });
      } else {
        setFields({});
        setMsg({ tone: "success", text: r.message ?? "Sent." });
      }
    });
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <Group legend="1. Exact dates and place" hint="Must fit everyone's plans. Fixed dates can't move.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="fp-dest" label="Destination" error={fields.destinationId}>
            <select id="fp-dest" className={inputClass} value={f.destinationId} onChange={(e) => set("destinationId", e.target.value)}>
              {destinationOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field id="fp-start" label="Start" error={fields.start}>
            <input id="fp-start" type="date" className={inputClass} min={window?.start} max={window?.end} value={f.start} onChange={(e) => set("start", e.target.value)} />
          </Field>
          <Field id="fp-end" label="End" error={fields.end}>
            <input id="fp-end" type="date" className={inputClass} min={f.start || window?.start} max={window?.end} value={f.end} onChange={(e) => set("end", e.target.value)} />
          </Field>
        </div>
      </Group>

      <Group legend="2. Do you want more people?">
        <div role="radiogroup" aria-label="Want more people" className="grid gap-2 sm:grid-cols-2">
          <OptionCard selected={!f.wantMore} title="No, we're set" description="The trip stays private to your group" onSelect={() => set("wantMore", false)} />
          <OptionCard selected={f.wantMore} title="Yes, open it up" description="It goes to Discover with open spots" onSelect={() => set("wantMore", true)} />
        </div>
        {f.wantMore && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field id="fp-spots" label="How many more?" error={fields.extraSpots}>
              <input id="fp-spots" type="number" min={1} max={TRIPS.maxExtraSpots} className={`${inputBase} w-28`} value={f.extraSpots} onChange={(e) => set("extraSpots", Number(e.target.value) || 1)} />
            </Field>
            <Field id="fp-deadline" label="3. When do sign-ups close?" optional hint="Default: 2 days before the trip" error={fields.joinDeadline}>
              <input id="fp-deadline" type="date" className={inputClass} max={f.start} value={f.joinDeadline} onChange={(e) => set("joinDeadline", e.target.value)} />
            </Field>
          </div>
        )}
      </Group>

      <Field id="fp-note" label="Anything else the group agreed?" optional error={fields.note}>
        <input id="fp-note" className={inputClass} maxLength={300} value={f.note} placeholder="Leaving Friday after class from the Marshall lot" onChange={(e) => set("note", e.target.value)} />
      </Field>

      {msg && <Notice tone={msg.tone} title={msg.text}>{msg.conflicts && <ul className="list-disc pl-4">{msg.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>}</Notice>}
      <div>
        <Button type="submit" loading={pending}>Send the final plan</Button>
        <p className="mt-1.5 text-xs text-muted">This counts as your acceptance. It&apos;s settled once everyone else accepts too.</p>
      </div>
    </form>
  );
}

export function AcceptButton({ tripId, version }: { tripId: string; version: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button loading={pending} onClick={() => start(async () => {
        const r = await acceptProposal(tripId, version);
        setMsg(r.ok ? { tone: "success", text: r.message ?? "Accepted." } : { tone: "error", text: r.error });
      })}>Accept this plan</Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
