// ============================================================================
// Match — for people who have a plan. One list of potential trips (two people
// or a group, scored from everyone's plan AND profile), best first, grouped by
// Thanksgiving / Winter / Spring / Weekends. No spots here: group size is part
// of the score. At the top: any plan still waiting for a match (24-hour window).
// ============================================================================
import Link from "next/link";
import { CalendarPlus, Compass, Hourglass, SearchX } from "lucide-react";
import { MAX_RESULTS, TRIPS } from "@/lib/constants";
import { todayLA } from "@/lib/dates";
import { getOnboardedViewer, loadPeople, pilotStats, planName } from "@/lib/data";
import { FilterBar } from "@/components/FilterBar";
import { hasFilters, parseFilters, passes as passesFilters } from "@/lib/filters";
import { CATEGORY_LABEL, findPotentialTrips, type Blocker, type TripCategory } from "@/lib/matching";
import { MatchCard } from "@/components/MatchCard";
import { ClearPassesButton, RefreshButton } from "@/components/MatchActions";
import { NoMatchPanel } from "@/components/NoMatchPanel";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const BLOCKER_TEXT: Record<Blocker, string> = {
  dates: "dates that don't overlap with yours",
  destination: "destinations outside your list",
  budget: "budgets that don't overlap with yours",
  groupSize: "group sizes outside a strict limit",
  score: "plans that only partly line up",
};
const CATEGORY_ORDER: TripCategory[] = ["thanksgiving", "winter", "spring", "weekend"];

export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseFilters(await searchParams);
  const { supabase, userId, plans: myPlans } = await getOnboardedViewer();
  const today = todayLA();

  const [people, stats, { data: passes }, { data: open }] = await Promise.all([
    loadPeople(supabase),
    pilotStats(supabase),
    supabase.from("match_passes").select("target_key"),
    supabase.from("proposals").select("id, plan_key, status").in("status", ["pending", "confirmed"]),
  ]);
  const mine = people.filter((p) => p.id === userId); // my ACTIVE plans
  const others = people.filter((p) => p.id !== userId);
  const passed = new Set((passes ?? []).map((p) => p.target_key as string));
  const tripByKey = new Map((open ?? []).map((p) => [p.plan_key as string, p.id as string]));
  const nameOf = new Map(myPlans.map((p) => [p.id, planName(p)]));

  const header = (
    <PageHeader title="Matches" subtitle={stats.open ? `${stats.joined} ${stats.joined === 1 ? "classmate has" : "classmates have"} joined so far` : `${stats.joined} of ${stats.total} pilot classmates have joined`}
      action={<RefreshButton />} />
  );

  // No plan at all -> Discover is the place to start.
  if (!myPlans.length) {
    return (
      <>
        {header}
        <EmptyState icon={<CalendarPlus />} title="Matching is for people with a plan"
          action={<div className="flex flex-wrap justify-center gap-2">
            <Link href="/plans/new" className="inline-flex h-11 items-center rounded-md bg-accent px-4 font-medium text-on-accent hover:bg-accent-hover">Add a plan</Link>
            <Link href="/discover" className="inline-flex h-11 items-center gap-2 rounded-md border border-border-interactive bg-surface-raised px-4 font-medium hover:bg-surface-hover"><Compass aria-hidden className="size-4" /> Browse Discover</Link>
          </div>}>
          No plan yet? Browse trips that are already happening on Discover and join one.
        </EmptyState>
      </>
    );
  }

  const { trips, blockedBy } = findPotentialTrips(mine, others, passed, today);
  const shown = trips.filter((t) => t.others.every((o) => passesFilters(o.plan, { ...filters, q: "" }, t.category)) && (!filters.q || t.others.some((o) => passesFilters(o.plan, filters, t.category))));

  // Who has tapped Interested on each potential trip.
  const { data: counts } = shown.length ? await supabase.rpc("interest_counts", { p_keys: shown.map((t) => t.key) }) : { data: [] };
  const interestBy = new Map(((counts ?? []) as { plan_key: string; interested: number; mine: boolean }[]).map((c) => [c.plan_key, c]));

  // My active plans with no match: the 24-hour window.
  const unmatched = mine.filter((m) => !trips.some((t) => t.mine.plan.id === m.plan.id));
  const windowMs = TRIPS.matchWindowHours * 3600_000;
  const nowMs = Date.now();

  return (
    <>
      {header}
      {unmatched.map((m) => {
        const full = myPlans.find((p) => p.id === m.plan.id)!;
        const since = full.searching_since ? new Date(full.searching_since).getTime() : nowMs;
        return <NoMatchPanel key={m.plan.id} planId={m.plan.id} planName={nameOf.get(m.plan.id) ?? "Your plan"} windowOver={nowMs - since >= windowMs}
          endsAt={new Date(since + windowMs).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })} />;
      })}
      {myPlans.some((p) => p.status === "ended") && (
        <p className="mb-4 text-sm text-muted">Some of your plans are closed. Reopen them from <Link href="/plans" className="font-medium text-accent-text underline-offset-4 hover:underline">My plans</Link>.</p>
      )}

      <FilterBar action="/matches" filters={filters} />
      {shown.length === 0 ? (
        hasFilters(filters) ? (
          <EmptyState icon={<SearchX />} title="No matches with these filters">Try another time or vibe, or clear the filters.</EmptyState>
        ) : others.length === 0 ? (
          <EmptyState icon={<Hourglass />} title="You're one of the first here">Matches appear as soon as classmates save plans. Meanwhile, check Discover.</EmptyState>
        ) : (
          <EmptyState icon={<SearchX />} title="No close matches right now"
            action={<div className="flex flex-wrap justify-center gap-2"><Link href="/plans" className="inline-flex h-11 items-center rounded-md bg-accent px-4 font-medium text-on-accent hover:bg-accent-hover">Add flexibility to my plans</Link>{passed.size > 0 && <ClearPassesButton />}</div>}>
            {(() => {
              const top = (Object.entries(blockedBy) as [Blocker, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
              return top.length ? <>Classmates mostly have {top.map(([b]) => BLOCKER_TEXT[b]).join(", or ")}. </> : null;
            })()}
            Widening your dates, choosing “these or nearby”, or a Flexible group size usually helps.
          </EmptyState>
        )
      ) : (
        CATEGORY_ORDER.map((c) => ({ c, items: shown.filter((t) => t.category === c).slice(0, MAX_RESULTS * 2) }))
          .filter((sec) => sec.items.length)
          .map((sec) => (
            <section key={sec.c} className="mb-8" aria-labelledby={`cat-${sec.c}`}>
              <h2 id={`cat-${sec.c}`} className="mb-3 text-lg font-semibold">{CATEGORY_LABEL[sec.c]} <span className="font-normal text-muted">({sec.items.length})</span></h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {sec.items.map((t, i) => {
                  const ic = interestBy.get(t.key);
                  return (
                    <li key={t.key} className="enter min-w-0" style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}>
                      <MatchCard m={{
                        key: t.key, score: t.score, reasons: t.reasons, hints: t.hints, trip: t.trip, place: t.place, size: t.size,
                        others: t.others.map((o) => ({ plan: o.plan, pace: o.profile.pace })),
                        myPlanName: myPlans.length > 1 ? nameOf.get(t.mine.plan.id) ?? null : null,
                        interested: ic?.interested ?? 0, iAmInterested: !!ic?.mine, openTripId: tripByKey.get(t.key) ?? null,
                      }} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
      )}
    </>
  );
}
