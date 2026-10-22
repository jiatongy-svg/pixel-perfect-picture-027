// ============================================================================
// Explore — every classmate's plan (each plan separately), anonymous, with a
// match score for every one: matches first, then plans that don't line up.
// Tap any plan for its details and a full score breakdown.
// ============================================================================
import { Compass, SearchX } from "lucide-react";
import { todayLA } from "@/lib/dates";
import { getOnboardedViewer, loadPeople } from "@/lib/data";
import { hasFilters, parseFilters, passes, planCategory } from "@/lib/filters";
import { bestAgainstMine, WHY } from "@/lib/explore";
import { ExploreCard, type ExploreItem } from "@/components/ExploreCard";
import { FilterBar } from "@/components/FilterBar";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseFilters(await searchParams);
  const { supabase, userId } = await getOnboardedViewer();
  const today = todayLA();
  const [people, { data: open }] = await Promise.all([loadPeople(supabase), supabase.from("proposals").select("plan_key").eq("status", "pending")]);
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
      const item: ExploreItem = {
        plan: p.plan,
        pace: p.profile.pace,
        photoPlace: best?.result.place ?? p.plan.destinations[0] ?? null,
        status,
        openProposal: openKeys.some((k) => k.split(",").includes(p.plan.id)),
      };
      // Matches first (by score), then everything else by its score.
      return { item, rank: !best ? 0 : best.result.eligible ? 1000 + best.result.score : best.result.fit };
    })
    .filter(({ item }) => passes(item.plan, filters, planCategory(item.plan)))
    .sort((a, b) => b.rank - a.rank || (a.item.plan.id < b.item.plan.id ? -1 : 1));

  return (
    <>
      <PageHeader title="Explore trips" subtitle="Every classmate's plans, anonymous, with your match score. Tap one for details." />
      <FilterBar action="/explore" filters={filters} />
      {others.length === 0 ? (
        <EmptyState icon={<Compass />} title="No classmates' plans yet">Once classmates save plans, you can browse them here — without names.</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon={<SearchX />} title="No plans match these filters">
          {hasFilters(filters) ? "Try a different time, vibe or budget, or clear the filters." : "Nothing to show right now."}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{items.length} of {others.length} {others.length === 1 ? "plan" : "plans"}{!mine.length && " · add a plan to see how each one matches yours"}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(({ item }, i) => (
              <li key={item.plan.id} className="enter min-w-0" style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}>
                <ExploreCard item={item} today={today} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
