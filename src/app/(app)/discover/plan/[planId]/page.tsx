// ============================================================================
// One classmate's plan, anonymous: the full trip, and how it scores against
// EACH of my plans (with the breakdown and what doesn't line up). From here
// you can propose a trip with whichever of your plans fits.
// ============================================================================
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Backpack, CalendarDays, Car, Gauge, MapPin, Wallet } from "lucide-react";
import { PACE, SCHEDULE, equipmentLabel, vibeLabel } from "@/lib/catalog";
import { todayLA } from "@/lib/dates";
import { budgetText, whenText } from "@/lib/describe";
import { getOnboardedViewer, loadPeople, planName } from "@/lib/data";
import { WHY, scoreAgainstMine } from "@/lib/explore";
import { memberKey } from "@/lib/matching";
import { mapUrl, placeLabel } from "@/lib/places";
import { DestinationImage } from "@/components/DestinationImage";
import { InterestButton } from "@/components/TripButtons";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(planId)) notFound();
  const { supabase, userId, plans: myPlans } = await getOnboardedViewer();
  const today = todayLA();
  const [[them], mineAll, { data: open }] = await Promise.all([
    loadPeople(supabase, { planIds: [planId] }),
    loadPeople(supabase, { userIds: [userId] }),
    supabase.from("proposals").select("id, plan_key").in("status", ["pending", "confirmed"]),
  ]);
  if (!them) notFound();
  if (them.id === userId) redirect(`/plans/${planId}`); // it's my own plan
  const openByKey = new Map((open ?? []).map((p) => [p.plan_key as string, p.id as string]));
  const nameOf = new Map(myPlans.map((p) => [p.id, planName(p)]));
  const scored = scoreAgainstMine(mineAll, them, today);
  const plan = them.plan;
  const lead = plan.destinations[0] ?? scored[0]?.result.place ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/discover" className="inline-flex w-fit items-center gap-1 rounded-sm text-sm font-medium text-muted hover:text-text"><ArrowLeft aria-hidden className="size-4" /> Discover</Link>
      <PageHeader title={plan.destinations.length ? plan.destinations.map(placeLabel).slice(0, 2).join(" / ") : "Open to anywhere"} subtitle="An anonymous classmate's plan. Names are shared once you both tap Interested and the group chat opens." />

      <Card className="flex flex-col gap-4">
        {lead && <DestinationImage place={lead} className="h-48 sm:h-60" />}
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <Item icon={<CalendarDays className="size-4" />} label="When" value={`${whenText(plan, today)}${plan.timing_mode === "break" && plan.date_mode !== "fixed" ? ` · ${plan.trip_length_min}–${plan.trip_length_max} days` : ""}`} />
          <Item icon={<Wallet className="size-4" />} label="Budget" value={`${budgetText(plan)} per person`} />
          <Item icon={<Gauge className="size-4" />} label="Style" value={[`${PACE.find((p) => p.id === them.profile.pace)?.label ?? "Balanced"} pace`, SCHEDULE.find((s) => s.id === them.profile.schedule)?.label, ...plan.vibes.map(vibeLabel)].filter(Boolean).join(" · ")} />
          {(plan.bringing_car || plan.bringing_gear.length > 0) && (
            <Item icon={plan.bringing_car ? <Car className="size-4" /> : <Backpack className="size-4" />} label="Bringing"
              value={[plan.bringing_car && `car (${plan.seats_offered} open ${plan.seats_offered === 1 ? "seat" : "seats"})`, ...plan.bringing_gear.map(equipmentLabel)].filter(Boolean).join(", ")} />
          )}
        </dl>
        {plan.destinations.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium">Destinations, in order{plan.destination_flex === "fixed" ? " (only these)" : plan.destination_flex === "open" ? " (open to anywhere)" : " (or nearby)"}</p>
            <ol className="flex flex-wrap gap-2">
              {plan.destinations.map((d, i) => (
                <li key={d.key}>
                  <a href={mapUrl(d)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border-interactive bg-surface-raised px-3 py-1 text-sm hover:bg-surface-hover">
                    <span className="font-semibold text-accent-text">{i + 1}</span> {placeLabel(d)} <MapPin aria-hidden className="size-3.5 text-muted" />
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Card>

      <h2 className="text-lg font-semibold">How it matches your {scored.length === 1 ? "plan" : "plans"}</h2>
      {scored.length === 0 ? (
        <Notice tone="info" title="Add a plan to see your match score." action={<Link href="/plans/new" className="font-medium text-accent-text underline-offset-4 hover:underline">Add a plan</Link>} />
      ) : (
        scored.map(({ me, result }) => {
          const openId = openByKey.get(memberKey([me.plan.id, plan.id]));
          return (
            <Card key={me.plan.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted">Your plan</p>
                  <p className="font-semibold break-words">{nameOf.get(me.plan.id) ?? "My plan"}</p>
                </div>
                <Badge tone={result.eligible ? "highlight" : "neutral"}>{result.eligible ? `${result.score}% match` : `${result.fit}% fit`}</Badge>
              </div>
              <ScoreBreakdown parts={result.parts} />
              {result.eligible ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {result.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />{r}</li>)}
                </ul>
              ) : (
                <p className="text-sm text-muted">Doesn&apos;t line up: {result.blockers.map((b) => WHY[b]).join(" Also, ")} The fit score shows how close it is anyway.</p>
              )}
              {result.hints.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm text-warning-text">{result.hints.map((h) => <li key={h}>• {h}</li>)}</ul>
              )}
              {openId ? (
                <Link href={`/trips/${openId}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border-interactive bg-surface-raised px-4 font-medium hover:bg-surface-hover">
                  Open the group chat <ArrowRight aria-hidden className="size-4" />
                </Link>
              ) : result.eligible ? (
                <div className="flex flex-col gap-1">
                  <InterestButton planKey={memberKey([me.plan.id, plan.id])} label="I'm interested — travel with this plan" />
                  <p className="text-xs text-muted">If they&apos;re interested too, a group chat opens so you can work out the details together.</p>
                </div>
              ) : null}
            </Card>
          );
        })
      )}
    </div>
  );
}

function Item({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <dt className="mt-0.5 shrink-0 text-muted"><span aria-hidden>{icon}</span><span className="sr-only">{label}</span></dt>
      <dd className="m-0 min-w-0 break-words">{value}</dd>
    </div>
  );
}
