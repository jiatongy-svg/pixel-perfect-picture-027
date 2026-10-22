// ============================================================================
// Explore — every classmate's current plan, anonymous, best match first.
// Plans that don't line up with yours are still shown (after the matches),
// with the general reason, so you can see what people are planning.
// ============================================================================
import { Compass, SearchX } from "lucide-react";
import { todayLA } from "@/lib/dates";
import { getOnboardedViewer, loadPeople } from "@/lib/data";
import { parseFilters, passes, planCategory, hasFilters } from "@/lib/filters";
import { memberKey, scorePair, type Blocker } from "@/lib/matching";
import { ExploreCard, type ExploreItem } from "@/components/ExploreCard";
import { FilterBar } from "@/components/FilterBar";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const WHY: Record<Blocker, string> = {
  dates: "Your dates don't overlap with this plan.",
  destination: "None of your destinations work for this plan.",
  budget: "Your budgets don't overlap.",
  score: "It only partly lines up with your plan.",
};

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseFilters(await searchParams);
  const { supabase, userId } = await getOnboardedViewer();
  const today = todayLA();
  const [people, { data: open }] = await Promise.all([loadPeople(supabase), supabase.from("proposals").select("id, member_key").eq("status", "pending")]);
  const me = people.find((p) => p.id === userId);
  const openByKey = new Map((open ?? []).map((p) => [p.member_key as string, p.id as string]));

  const items: (ExploreItem & { rank: number })[] = people
    .filter((p) => p.id !== userId)
    .map((p) => {
      const r = me ? scorePair(me, p, today) : null;
      const status: ExploreItem["status"] = !r ? { kind: "noplan" } : r.eligible ? { kind: "match", score: r.score, reasons: r.reasons } : { kind: "nofit", why: WHY[r.blockers[0]] };
      return {
        ownerId: p.id,
        plan: p.plan,
        pace: p.profile.pace,
        photoPlace: r?.place ?? p.plan.destinations[0] ?? null,
        status,
        openProposalId: openByKey.get(memberKey([userId, p.id])) ?? null,
        // Matches first (by score), then everything else by partial fit.
        rank: !r ? 0 : r.eligible ? 1000 + r.score : r.fit,
      };
    })
    .filter((it) => passes(it.plan, filters, planCategory(it.plan)))
    .sort((a, b) => b.rank - a.rank || (a.ownerId < b.ownerId ? -1 : 1));

  const total = people.filter((p) => p.id !== userId).length;

  return (
    <>
      <PageHeader title="Explore trips" subtitle="Everyone's current plans, anonymous. Your best matches come first." />
      <FilterBar action="/explore" filters={filters} />
      {total === 0 ? (
        <EmptyState icon={<Compass />} title="No classmates' plans yet">Once classmates save a plan, you can browse them here — without names.</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon={<SearchX />} title="No plans match these filters">
          {hasFilters(filters) ? "Try a different time, vibe or budget, or clear the filters." : "Nothing to show right now."}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{items.length} of {total} {total === 1 ? "plan" : "plans"}{!me && " · save your plan to see how each one matches yours"}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it, i) => (
              <li key={it.ownerId} className="enter min-w-0" style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}>
                <ExploreCard item={it} today={today} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
