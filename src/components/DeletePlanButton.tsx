"use client";
// Delete one of my plans, with a confirm step. Open proposals that used this
// plan stay visible, but can no longer be countered.
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deletePlan } from "@/app/actions";
import { Button, Notice } from "@/components/ui";

export function DeletePlanButton({ planId }: { planId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!confirming)
    return <Button variant="danger" size="sm" onClick={() => setConfirming(true)}><Trash2 aria-hidden className="size-4" /> Delete this plan</Button>;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-danger p-3">
      <p className="text-sm">Delete this plan? Classmates won&apos;t see it anymore. Open proposals that use it stay in your Proposals list.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="danger" size="sm" loading={pending} onClick={() => start(async () => { const r = await deletePlan(planId); if (r && !r.ok) setError(r.error); })}>Yes, delete</Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    </div>
  );
}
