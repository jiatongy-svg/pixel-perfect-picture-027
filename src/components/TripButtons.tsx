"use client";
// Small buttons for trips: Join (Discover), Interested (a plan's detail page),
// Leave (with a confirm step), and "Stay" after the group grew.
import { useState, useTransition } from "react";
import { LogOut } from "lucide-react";
import { expressInterest, joinTrip, leaveTrip, restartPlanSearch, stayInTrip } from "@/app/actions";
import { Button, Notice } from "@/components/ui";

type Result = { ok: boolean; error?: string; message?: string } | undefined;

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r && !r.ok) setMsg({ tone: "error", text: r.error ?? "Something went wrong." });
      else if (r?.message) setMsg({ tone: "success", text: r.message });
    });
  return { pending, msg, run };
}

export function JoinButton({ tripId, disabledReason }: { tripId: string; disabledReason?: string | null }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <Button disabled={!!disabledReason} loading={pending} onClick={() => run(() => joinTrip(tripId))}>Join this trip</Button>
      <p className="text-xs text-muted">{disabledReason ?? "You join the plan as it is. You'll see the group and the chat, and you can leave any time with one tap."}</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}

export function InterestButton({ planKey, label = "I'm interested" }: { planKey: string; label?: string }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <Button loading={pending} onClick={() => run(() => expressInterest(planKey))}>{label}</Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}

// Leaving is judgment-free: one tap, one confirm.
export function LeaveButton({ tripId, pendingMatch }: { tripId: string; pendingMatch: boolean }) {
  const { pending, msg, run } = useRun();
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}><LogOut aria-hidden className="size-4" /> {pendingMatch ? "We can't agree — end this match" : "Leave this trip"}</Button>;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm">{pendingMatch ? "End this match? The chat closes for everyone, and you can look for a new match." : "Leave this trip? Your spot opens up for someone else. No hard feelings."}</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex gap-2">
        <Button variant="danger" size="sm" loading={pending} onClick={() => run(() => leaveTrip(tripId))}>{pendingMatch ? "End match" : "Leave"}</Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    </div>
  );
}

// "This group has grown beyond your preferred size. Stay or leave?"
export function GroupGrewNotice({ tripId, size, prefLabel }: { tripId: string; size: number; prefLabel: string }) {
  const { pending, msg, run } = useRun();
  const [leaving, setLeaving] = useState(false);
  return (
    <div role="status" className="flex flex-col gap-3 rounded-md bg-warning-bg p-3 text-sm">
      <p><span className="font-semibold text-warning-text">This group has grown beyond your preferred size.</span> It&apos;s now {size} people (you prefer {prefLabel}). Stay or leave?</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {leaving ? (
        <div className="flex gap-2">
          <Button variant="danger" size="sm" loading={pending} onClick={() => run(() => leaveTrip(tripId))}>Yes, leave</Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setLeaving(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" loading={pending} onClick={() => run(() => stayInTrip(tripId))}>Stay</Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => setLeaving(true)}>Leave</Button>
        </div>
      )}
    </div>
  );
}

// Reopen a plan that was closed after "no match" (starts a new 24-hour window).
export function ReopenPlanButton({ planId }: { planId: string }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => restartPlanSearch(planId))}>Reopen for matching</Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
