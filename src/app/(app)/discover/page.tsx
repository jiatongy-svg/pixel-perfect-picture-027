// ============================================================================
// Discover (formerly Explore).
//   1. Open trips — confirmed plans with open spots: "this is happening, join
//      if you want". Joiners accept the plan as it is. Anonymous until you join.
//   2. Classmates' plans — every active plan, anonymous, with your score.
// People with no plan start here. They see a light "similar style" signal,
// never a score.
// ============================================================================
import Link from "next/link";
import { Compass, SearchX, Tent } from "lucide-react";
import { todayLA } from "@/lib/dates";
import { getOnboardedViewer, loadPeople } from "@/lib/data";
import { strictBlocks, styleSignal, type OpenTrip } from "@/lib/discover";
import { hasFilters, parseFilters, passes, planCategory } from "@/lib/filters";
import { bestAgainstMine, WHY } from "@/lib/explore";
import { tripCategory } from "@/lib/matching";
import { ExploreCard, type ExploreItem } from "@/components/ExploreCard";
import { FilterBar } from "@/components/FilterBar";
import { OpenTripCard } from "@/components/OpenTripCard";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseFilters(await searchParams);
  const { supabase, userId, profile, plans: myPlans } = await getOnboardedViewer();
  const today = todayLA();
  const [people, { data: openRows }, { data: open }] = await Promise.all([
    loadPeople(supabase),
    supabase.from("open_trips").select("*").order("created_at", { ascending: false }),
    supabase.from("proposals").select("plan_key").eq("status", "pending"),
  ]);

  // 1. Open trips, filtered like everything else (by their final itinerary).
  const openTrips = ((openRows ?? []) as OpenTrip[]).filter((t) => {
    const m = t.merged;
    if (!m?.dates) return false;
    const cat = tripCategory(m.dates);
    if (filters.when !== "all" && cat !== filters.when) return false;
    if (filters.max !== null && m.costs && m.costs.perPersonTotal[0] > filters.max) return false;
    if (filters.vibe && !t.members.some((x) => x.vibes?.includes(filters.vibe))) return false;
    if (filters.q && !(m.destination?.name ?? "").toLowerCase().includes(filters.q.toLowerCase())) return false;
    return true;
  });

  // 2. Classmates' plans with my score (if I have plans).
  const mine = people.filter((p) => p.id === userId);
  const others = people.filter((p) => p.id !== userId);
  const openKeys = (open ?? []).map((p) => p.plan_key as string);
  const items = others
    .map((p) => {
      const best = bestAgainstMine(mine, p, today);
      const status: ExploreItem["status"] = !best
        ? { kind: "noplan" }
        : best.result.eligible
          ? { kind: "match", score: best.result.score, reason: best.result.reasons[0] ?? null }
          : { kind: "nofit", score: best.result.fit, why: WHY[best.result.blockers[0]] };
      const item: ExploreItem = { plan: p.plan, pace: p.profile.pace, photoPlace: best?.result.place ?? p.plan.destinations[0] ?? null, status, openProposal: openKeys.some((k) => k.split(",").includes(p.plan.id)) };
      return { item, rank: !best ? 0 : best.result.eligible ? 1000 + best.result.score : best.result.fit };
    })
    .filter(({ item }) => passes(item.plan, filters, planCategory(item.plan)))
    .sort((a, b) => b.rank - a.rank || (a.item.plan.id < b.item.plan.id ? -1 : 1));

  return (
    <>
      <PageHeader title="Discover" subtitle={myPlans.length ? "Trips that are happening, and every classmate's plans." : "No plan? No problem — join a trip that's already happening."} />
      <FilterBar action="/discover" filters={filters} />

      <section className="mb-10" aria-labelledby="open-trips">
        <h2 id="open-trips" className="mb-1 text-lg font-semibold">Open trips — join now</h2>
        <p className="mb-3 text-sm text-muted">Confirmed plans with open spots. You join the plan as it is, and can leave any time.</p>
        {openTrips.length === 0 ? (
          <EmptyState icon={<Tent />} title={hasFilters(filters) ? "No open trips match these filters" : "No open trips yet"}
            action={<Link href="/plans/new" className="inline-flex h-11 items-center rounded-md bg-accent px-4 font-medium text-on-accent hover:bg-accent-hover">Start one</Link>}>
            Going somewhere no matter what? Add a plan and post it here so classmates can join.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {openTrips.map((t) => (
              <li key={t.id} className="min-w-0"><OpenTripCard trip={t} signal={styleSignal(profile, t.members)} blocked={!t.is_member && !!strictBlocks(profile, t)} /></li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="plans">
        <h2 id="plans" className="mb-1 text-lg font-semibold">Classmates&apos; plans</h2>
        <p className="mb-3 text-sm text-muted">Still being worked out. Anonymous{mine.length ? ", with your match score" : ""}. Tap one for details.</p>
        {others.length === 0 ? (
          <EmptyState icon={<Compass />} title="No classmates' plans yet">Once classmates save plans, you can browse them here — without names.</EmptyState>
        ) : items.length === 0 ? (
          <EmptyState icon={<SearchX />} title="No plans match these filters">Try a different time, vibe or budget, or clear the filters.</EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(({ item }) => (
              <li key={item.plan.id} className="min-w-0"><ExploreCard item={item} today={today} /></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
