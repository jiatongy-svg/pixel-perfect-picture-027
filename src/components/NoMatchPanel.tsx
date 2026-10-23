"use client";
// ============================================================================
// A plan with no match yet. For the first 24 hours: "still looking". After
// that, the student chooses:
//   End        — close the request (then "Propose a new plan?")
//   Still go   — post it to Discover so others can join
//   Keep looking — another 24 hours
// ============================================================================
import Link from "next/link";
import { useState, useTransition } from "react";
import { Hourglass } from "lucide-react";
import { endPlanSearch, hostTrip, restartPlanSearch } from "@/app/actions";
import { TRIPS } from "@/lib/constants";
import { Button, Field, Notice, inputBase } from "@/components/ui";

export function NoMatchPanel({ planId, planName, windowOver, endsAt }: { planId: string; planName: string; windowOver: boolean; endsAt: string }) {
  const [pending, start] = useTransition();
  const [step, setStep] = useState<"choose" | "publish" | "ended">("choose");
  const [spots, setSpots] = useState(2);
  const [deadline, setDeadline] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string; conflicts?: string[] } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; conflicts?: string[] } | undefined>, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r && !r.ok) setMsg({ tone: "error", text: r.error ?? "Something went wrong.", conflicts: r.conflicts });
      else after?.();
    });

  if (!windowOver) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-4 text-sm shadow-sm">
        <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        <p><span className="font-medium">{planName}:</span> no match yet. We&apos;ll keep looking as classmates add plans — check back by {endsAt}.</p>
      </div>
    );
  }

  if (step === "ended") {
    return (
      <div className="mb-4"><Notice tone="info" title={`Closed “${planName}”.`}
        action={<Link href="/plans/new" className="font-medium text-accent-text underline-offset-4 hover:underline">Propose a new plan?</Link>} /></div>
    );
  }

  return (
    <section className="mb-4 flex flex-col gap-3 rounded-lg border border-highlight bg-surface-raised p-4 shadow-sm" aria-label={`No match yet for ${planName}`}>
      <div>
        <p className="font-semibold">No match yet for “{planName}”</p>
        <p className="text-sm text-muted">It&apos;s been 24 hours. What would you like to do?</p>
      </div>
      {msg && <Notice tone={msg.tone} title={msg.text}>{msg.conflicts && <ul className="list-disc pl-4">{msg.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>}</Notice>}
      {step === "choose" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => setStep("publish")}>Still go — post to Discover</Button>
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => restartPlanSearch(planId))}>Keep looking 24h more</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => endPlanSearch(planId), () => setStep("ended"))}>End</Button>
        </div>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => hostTrip({ planId, spots, joinDeadline: deadline || null })); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`spots-${planId}`} label="Open spots" hint="How many people can join you?">
              <input id={`spots-${planId}`} type="number" min={1} max={TRIPS.maxExtraSpots} className={`${inputBase} w-28`} value={spots} onChange={(e) => setSpots(Number(e.target.value) || 1)} />
            </Field>
            <Field id={`dl-${planId}`} label="Sign-ups close" optional hint="Default: 2 days before the trip">
              <input id={`dl-${planId}`} type="date" className={`${inputBase} w-full`} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-muted">Your plan is posted as it is. People who join accept it as-is and can leave any time. Your name stays hidden until they join.</p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={pending}>Post to Discover</Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setStep("choose")}>Back</Button>
          </div>
        </form>
      )}
    </section>
  );
}
