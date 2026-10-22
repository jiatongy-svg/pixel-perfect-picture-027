"use client";
// "Propose a trip" between one of my plans and another plan. On success the
// server takes you to the new proposal; on failure we explain why.
import { useState, useTransition } from "react";
import { proposeTrip } from "@/app/actions";
import { Button, Notice } from "@/components/ui";

export function ProposeButton({ myPlanId, otherPlanId, label = "Propose a trip" }: { myPlanId: string; otherPlanId: string; label?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ text: string; conflicts?: string[] } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => start(async () => { setError(null); const r = await proposeTrip(myPlanId, [otherPlanId]); if (r && !r.ok) setError({ text: r.error, conflicts: r.conflicts }); })} loading={pending}>
        {label}
      </Button>
      {error && (
        <Notice tone="error" title={error.text}>
          {error.conflicts && <ul className="list-disc pl-4">{error.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>}
        </Notice>
      )}
    </div>
  );
}
