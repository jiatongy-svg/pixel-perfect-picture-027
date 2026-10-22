// ============================================================================
// Matches — computed fresh on every visit from everyone's latest saved plans
// (force-dynamic = no caching). Two tabs: pairs and groups of 3–4.
// ============================================================================
import Link from "next/link";
import { CalendarPlus, Hourglass, SearchX, Users } from "lucide-react";
import { MAX_GROUP_SIZE } from "@/lib/constants";
import { todayLA } from "@/lib/dates";
import { getOnboardedViewer, loadPeople, photoUrls, pilotStats } from "@/lib/data";
import { findGroupMatches, findPairMatches, memberKey, type Blocker } from "@/lib/matching";
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

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === "groups" ? "groups" : "pairs";
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

  const pairs = findPairMatches(me, others, passedIds, today);
  const groups = findGroupMatches(me, others, passedIds, passKeys, today);
  const urls = await photoUrls(supabase, people.map((p) => p.profile.photo_path));
  const photo = (path: string | null) => (path ? urls[path] ?? null : null);

  const tabs = (
    <div role="tablist" aria-label="Match type" className="mb-5 inline-flex rounded-md border border-border bg-surface-sunken p-1">
      {(["pairs", "groups"] as const).map((t) => (
        <Link key={t} role="tab" aria-selected={view === t} href={t === "pairs" ? "/matches" : "/matches?view=groups"}
          className={cx("rounded-sm px-4 py-1.5 text-sm font-medium transition-colors duration-150", view === t ? "bg-surface-raised text-text shadow-sm" : "text-muted hover:text-text")}>
          {t === "pairs" ? `Pairs (${pairs.pairs.length})` : `Groups of 3–${MAX_GROUP_SIZE} (${groups.length})`}
        </Link>
      ))}
    </div>
  );

  // Empty state (b): classmates exist, none compatible — say why in general terms.
  const topBlockers = (Object.entries(pairs.blockedBy) as [Blocker, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const noneCompatible = (
    <EmptyState icon={<SearchX />} title={view === "pairs" ? "No compatible classmates right now" : "No groups line up right now"}
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
      {view === "pairs" ? (
        pairs.pairs.length === 0 ? noneCompatible : (
          <ul className="grid gap-4 md:grid-cols-2">
            {pairs.pairs.map((m, i) => (
              <li key={m.person.id} className="enter min-w-0" style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}>
                <MatchCard kind="pair" score={m.score} reasons={m.reasons} members={[{ person: m.person, photo: photo(m.person.profile.photo_path) }]}
                  targetKey={m.person.id} openProposalId={openByKey.get(memberKey([userId, m.person.id])) ?? null} today={today} />
              </li>
            ))}
          </ul>
        )
      ) : groups.length === 0 ? noneCompatible : (
        <ul className="grid gap-4 md:grid-cols-2">
          {groups.map((g, i) => (
            <li key={g.key} className="enter min-w-0" style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}>
              <MatchCard kind="group" score={g.score} reasons={g.reasons} members={g.members.map((p) => ({ person: p, photo: photo(p.profile.photo_path) }))}
                targetKey={g.key} openProposalId={openByKey.get(g.key) ?? null} today={today} />
            </li>
          ))}
        </ul>
      )}
      {view === "groups" && groups.length > 0 && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Users aria-hidden className="size-4" /> A group trip is set only when every member accepts the same version.</p>
      )}
    </>
  );
}
