// ============================================================================
// One anonymous plan on the Explore page: the trip, never the person (no name,
// photo or year). Every plan shows a match score against your best-fitting
// plan. The whole card opens the plan's detail page.
// ============================================================================
import Link from "next/link";
import { CalendarDays, Car, ChevronRight, Gauge, Wallet } from "lucide-react";
import { PACE, vibeLabel } from "@/lib/catalog";
import { budgetText, whenText, whereText } from "@/lib/describe";
import type { Place } from "@/lib/places";
import type { PublicPlan } from "@/lib/types";
import { DestinationImage } from "@/components/DestinationImage";
import { Badge, Card } from "@/components/ui";

export type ExploreItem = {
  plan: PublicPlan;
  pace: string;
  photoPlace: Place | null;
  // match: lines up with one of my plans. nofit: a hard rule fails (score still shown).
  status: { kind: "match"; score: number; reason: string | null } | { kind: "nofit"; score: number; why: string } | { kind: "noplan" };
  openProposal: boolean;
};

export function ExploreCard({ item, today }: { item: ExploreItem; today: string }) {
  const { plan, status } = item;
  return (
    <Card as="article" className="relative flex h-full flex-col gap-3 p-3 transition-shadow duration-150 hover:shadow-md sm:p-4">
      {item.photoPlace && <DestinationImage place={item.photoPlace} />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Anonymous classmate</p>
          <h3 className="text-lg leading-snug font-semibold break-words">
            {/* The stretched link makes the whole card clickable; inner links sit above it. */}
            <Link href={`/explore/${plan.id}`} className="rounded-sm after:absolute after:inset-0 after:content-['']">{whereText(plan)}</Link>
          </h3>
        </div>
        {status.kind === "match" && <Badge tone="highlight">{status.score}% match</Badge>}
        {status.kind === "nofit" && <Badge tone="neutral">{status.score}% fit</Badge>}
      </div>

      <dl className="grid grid-cols-1 gap-1.5 text-sm">
        <Row icon={<CalendarDays className="size-4" />} label="When" value={whenText(plan, today)} />
        <Row icon={<Wallet className="size-4" />} label="Budget" value={`${budgetText(plan)} per person`} />
        <Row icon={<Gauge className="size-4" />} label="Style" value={[`${PACE.find((p) => p.id === item.pace)?.label ?? "Balanced"} pace`, ...plan.vibes.map(vibeLabel)].join(" · ")} />
        {plan.bringing_car && <Row icon={<Car className="size-4" />} label="Car" value={`Bringing a car (${plan.seats_offered} open ${plan.seats_offered === 1 ? "seat" : "seats"})`} />}
      </dl>

      <p className="text-sm text-muted">
        {status.kind === "match" && (status.reason ?? "Lines up with your plan.")}
        {status.kind === "nofit" && <>Doesn&apos;t line up: {status.why}</>}
        {status.kind === "noplan" && "Add a plan to see how this one matches."}
        {item.openProposal && <span className="block font-medium text-accent-text">You have an open proposal for this plan.</span>}
      </p>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-accent-text">See details & score <ChevronRight aria-hidden className="size-4" /></span>
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
