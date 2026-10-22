"use client";
// ============================================================================
// One anonymous plan on the Explore page. Shows the trip, never the person:
// no name, photo or year. Names are shared only after someone proposes a trip.
// ============================================================================
import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, Backpack, CalendarDays, Car, Gauge, Wallet } from "lucide-react";
import { proposeTrip } from "@/app/actions";
import { PACE, equipmentLabel, vibeLabel } from "@/lib/catalog";
import { budgetText, whenText, whereText } from "@/lib/describe";
import type { Place } from "@/lib/places";
import type { PublicPlan } from "@/lib/types";
import { DestinationImage } from "@/components/DestinationImage";
import { Badge, Button, Card, Notice } from "@/components/ui";

export type ExploreItem = {
  ownerId: string; // used only to propose; never displayed
  plan: PublicPlan;
  pace: string;
  photoPlace: Place | null;
  status: { kind: "match"; score: number; reasons: string[] } | { kind: "nofit"; why: string } | { kind: "noplan" };
  openProposalId: string | null;
};

export function ExploreCard({ item, today }: { item: ExploreItem; today: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ text: string; conflicts?: string[] } | null>(null);
  const { plan, status } = item;

  function propose() {
    setError(null);
    start(async () => {
      const r = await proposeTrip([item.ownerId]);
      if (r && !r.ok) setError({ text: r.error, conflicts: r.conflicts });
    });
  }

  return (
    <Card as="article" className="flex h-full flex-col gap-3 p-3 sm:p-4">
      {item.photoPlace && <DestinationImage place={item.photoPlace} />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Anonymous classmate</p>
          <h3 className="text-lg leading-snug font-semibold break-words">{whereText(plan)}</h3>
        </div>
        {status.kind === "match" && <Badge tone="highlight">{status.score}% match</Badge>}
        {status.kind === "nofit" && <Badge tone="neutral">Doesn&apos;t line up</Badge>}
      </div>

      <dl className="grid grid-cols-1 gap-1.5 text-sm">
        <Row icon={<CalendarDays className="size-4" />} label="When" value={whenText(plan, today)} />
        <Row icon={<Wallet className="size-4" />} label="Budget" value={`${budgetText(plan)} per person`} />
        <Row icon={<Gauge className="size-4" />} label="Style" value={[PACE.find((p) => p.id === item.pace)?.label + " pace", ...plan.vibes.map(vibeLabel)].join(" · ")} />
        {(plan.bringing_car || plan.bringing_gear.length > 0) && (
          <Row icon={plan.bringing_car ? <Car className="size-4" /> : <Backpack className="size-4" />} label="Bringing"
            value={[plan.bringing_car && `car (${plan.seats_offered} open ${plan.seats_offered === 1 ? "seat" : "seats"})`, ...plan.bringing_gear.map(equipmentLabel)].filter(Boolean).join(", ")} />
        )}
      </dl>

      {status.kind === "match" && (
        <ul className="flex flex-col gap-1 text-sm">
          {status.reasons.slice(0, 2).map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />{r}</li>)}
        </ul>
      )}
      {status.kind === "nofit" && <p className="text-sm text-muted">{status.why}</p>}

      {error && (
        <Notice tone="error" title={error.text}>
          {error.conflicts && <ul className="list-disc pl-4">{error.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>}
        </Notice>
      )}

      <footer className="mt-auto pt-1">
        {item.openProposalId ? (
          <Link href={`/proposals/${item.openProposalId}`} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border-interactive bg-surface-raised px-4 font-medium hover:bg-surface-hover">
            View open proposal <ArrowRight aria-hidden className="size-4" />
          </Link>
        ) : status.kind === "match" ? (
          <>
            <Button className="w-full" onClick={propose} loading={pending}>Propose a trip</Button>
            <p className="mt-1.5 text-xs text-muted">You&apos;ll both see each other&apos;s names once you propose.</p>
          </>
        ) : status.kind === "noplan" ? (
          <Link href="/plan" className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border-interactive bg-surface-raised px-4 text-sm font-medium hover:bg-surface-hover">
            Save your plan to see your match
          </Link>
        ) : null}
      </footer>
    </Card>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <dt className="mt-0.5 shrink-0 text-muted"><span aria-hidden>{icon}</span><span className="sr-only">{label}</span></dt>
      <dd className="m-0 min-w-0 break-words">{value}</dd>
    </div>
  );
}
