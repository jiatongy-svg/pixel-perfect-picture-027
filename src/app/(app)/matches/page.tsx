// ============================================================================
// Matches — computed fresh on every visit from everyone's latest saved plans
// (force-dynamic = no caching). Two tabs: pairs and groups of 3–4.
// ============================================================================
import Link from "next/link";
import { CalendarPlus, Hourglass, SearchX, Users } from "lucide-react";
import { MAX_GROUP_SIZE, MAX_RESULTS } from "@/lib/constants";
import { todayLA } from "@/lib/dates";
import { getOnboardedViewer, loadPeople, photoUrls, pilotStats } from "@/lib/data";
import { hasFilters, parseFilters, passes as passesFilters } from "@/lib/filters";
import { CATEGORY_LABEL, findGroupMatches, findPairMatches, memberKey, type Blocker, type TripCategory } from "@/lib/matching";
import { FilterBar } from "@/components/FilterBar";
import { MatchCard } from "@/components/MatchCard";
import { ClearPassesButton, RefreshButton } from "@/components/MatchActions";
import { EmptyState, PageHeader, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

const BLOCKER_TEXT: Record<Blocker, string> = {
  dates: "dates that don't overlap with yours",
  destination: "destinations outside your list",
  budget: "budgets that don't overlap with yours",
  score: "plans that only partly line up",
};

const CATEGORY_ORDER: TripCategory[] = ["thanksgiving", "winter", "spring", "weekend"];

// Split a list into sections by trip category, keeping the order inside each.
function byCategory<T extends { category: TripCategory }>(items: T[]) {
  return CATEGORY_ORDER.map((c) => ({ category: c, items: items.filter((x) => x.category === c).slice(0, MAX_RESULTS) })).filter((g) => g.items.length);
}

export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const view = sp.view === "groups" ? "groups" : "pairs";
  const filters = parseFilters(sp);
  const { supabase, userId, plan } = await getOnboardedViewer();
  const today = todayLA();

  const [people, stats, { data: passes }, { data: open }] = await Promise.all([
    loadPeople(supabase),
    pilotStats(supabase),
    supabase.from("match_passes").select("target_key"),
    supabase.from("proposals").select("id, member_key").eq("status", "pending"),
  ]);
  const me = people.find((p) => p.id === userId);
  const others = people.filter((p) => p.id !== userId);
  const passKeys = new Set((passes ?? []).map((p) => p.target_key as string));
  const passedIds = new Set([...passKeys].filter((k) => !k.includes(",")));
  const openByKey = new Map((open ?? []).map((p) => [p.member_key as string, p.id as string]));

  const header = (
    <PageHeader
      title="Matches"
      subtitle={stats.open ? `${stats.joined} ${stats.joined === 1 ? "classmate has" : "classmates have"} joined so far` : `${stats.joined} of ${stats.total} pilot classmates have joined`}
      action={<RefreshButton />}
    />
  );

  // Empty state (c): no plan saved yet.
  if (!plan || !me) {
    return (
      <>
        {header}
        <EmptyState icon={<CalendarPlus />} title="Add your plan to see matches" action={<Link href="/plan" className="inline-flex h-11 items-center rounded-md bg-accent px-4 font-medium text-on-accent hover:bg-accent-hover">Add my plan</Link>}>
          Pick a long break or a few weekends. You don't need a destination yet — choose “I'm open to anywhere”.
        </EmptyState>
      </>
    );
  }

  // Empty state (a): nobody else has a plan yet.
  if (others.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon={<Hourglass />} title={stats.open ? "Waiting on classmates — you're the first one here" : `Waiting on classmates — ${stats.joined} of ${stats.total} have joined`}>
          Your plan is saved. Matches appear here as soon as another pilot classmate saves theirs. Nothing to do but check back.
        </EmptyState>
      </>
    );
  }

  // All eligible matches, then the filters, then up to MAX_RESULTS per category.
  const pairs = findPairMatches(me, others, passedIds, today, Infinity);
  const shownPairs = pairs.pairs.filter((m) => passesFilters(m.person.plan, filters, m.category));
  const groups = findGroupMatches(me, others, passedIds, passKeys, today, Infinity).filter((g) =>
    g.members.every((p) => passesFilters(p.plan, { ...filters, q: "" }, g.category)) && (!filters.q || g.members.some((p) => passesFilters(p.plan, filters, g.category))),
  );
  const urls = await photoUrls(supabase, people.map((p) => p.profile.photo_path));
  const photo = (path: string | null) => (path ? urls[path] ?? null : null);

  const tabs = (
    <div role="tablist" aria-label="Match type" className="mb-5 inline-flex rounded-md border border-border bg-surface-sunken p-1">
      {(["pairs", "groups"] as const).map((t) => (
        <Link key={t} role="tab" aria-selected={view === t} href={`/matches?${new URLSearchParams({ ...(t === "groups" ? { view: "groups" } : {}), ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "" && v !== null && v !== "all").map(([k, v]) => [k, String(v)])) })}`}
          className={cx("rounded-sm px-4 py-1.5 text-sm font-medium transition-colors duration-150", view === t ? "bg-surface-raised text-text shadow-sm" : "text-muted hover:text-text")}>
          {t === "pairs" ? `Pairs (${shownPairs.length})` : `Groups of 3–${MAX_GROUP_SIZE} (${groups.length})`}
        </Link>
      ))}
    </div>
  );

  // Empty state (b): classmates exist, none compatible — say why in general terms.
  const topBlockers = (Object.entries(pairs.blockedBy) as [Blocker, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const noneCompatible = (
    hasFilters(filters) ? (
      <EmptyState icon={<SearchX />} title="No matches with these filters">You have matches, but none fit these filters. Try another time or vibe, or clear the filters.</EmptyState>
    ) : <EmptyState icon={<SearchX />} title={view === "pairs" ? "No compatible classmates right now" : "No groups line up right now"}
      action={<div className="flex flex-wrap justify-center gap-2"><Link href="/plan" className="inline-flex h-11 items-center rounded-md bg-accent px-4 font-medium text-on-accent hover:bg-accent-hover">Add flexibility to my plan</Link>{passKeys.size > 0 && <ClearPassesButton />}</div>}>
      {topBlockers.length > 0 ? (
        <>Classmates mostly have {topBlockers.map(([b]) => BLOCKER_TEXT[b]).join(", or ")}. </>
      ) : view === "groups" ? (
        <>Groups need everyone to share dates, a destination and a budget range. </>
      ) : null}
      Widening your dates, choosing “these or nearby”, or stretching your budget usually helps.
      {passKeys.size > 0 && ` You've passed on ${passKeys.size} ${passKeys.size === 1 ? "match" : "matches"}.`}
    </EmptyState>
  );

  return (
    <>
      {header}
      {tabs}
      <FilterBar action="/matches" filters={filters} keep={view === "groups" ? { view: "groups" } : undefined} />
      {view === "pairs" ? (
        shownPairs.length === 0 ? noneCompatible : (
          byCategory(shownPairs).map((sec) => (
            <section key={sec.category} className="mb-8" aria-labelledby={`cat-${sec.category}`}>
              <h2 id={`cat-${sec.category}`} className="mb-3 text-lg font-semibold">{CATEGORY_LABEL[sec.category]} <span className="font-normal text-muted">({sec.items.length})</span></h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {sec.items.map((m, i) => (
                  <li key={m.person.id} className="enter min-w-0" style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}>
                    <MatchCard kind="pair" score={m.score} reasons={m.reasons} place={m.place} members={[{ person: m.person, photo: photo(m.person.profile.photo_path) }]}
                      targetKey={m.person.id} openProposalId={openByKey.get(memberKey([userId, m.person.id])) ?? null} today={today} viewerMbti={me.profile.mbti} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )
      ) : groups.length === 0 ? noneCompatible : (
        byCategory(groups).map((sec) => (
          <section key={sec.category} className="mb-8" aria-labelledby={`gcat-${sec.category}`}>
            <h2 id={`gcat-${sec.category}`} className="mb-3 text-lg font-semibold">{CATEGORY_LABEL[sec.category]} <span className="font-normal text-muted">({sec.items.length})</span></h2>
            <ul className="grid gap-4 md:grid-cols-2">
              {sec.items.map((g, i) => (
                <li key={g.key} className="enter min-w-0" style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}>
                  <MatchCard kind="group" score={g.score} reasons={g.reasons} place={g.place} members={g.members.map((p) => ({ person: p, photo: photo(p.profile.photo_path) }))}
                    targetKey={g.key} openProposalId={openByKey.get(g.key) ?? null} today={today} viewerMbti={me.profile.mbti} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {view === "groups" && groups.length > 0 && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Users aria-hidden className="size-4" /> A group trip is set only when every member accepts the same version.</p>
      )}
    </>
  );
}
