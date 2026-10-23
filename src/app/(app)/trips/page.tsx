// ============================================================================
// My trips — every match chat and trip I'm in:
//   Needs you        a final plan waiting for my Accept
//   Working it out   group chats still deciding
//   Confirmed        settled trips (maybe open on Discover)
//   Ended            matches that didn't work out
// ============================================================================
import Link from "next/link";
import { Inbox } from "lucide-react";
import { formatRange } from "@/lib/dates";
import { getOnboardedViewer, loadProposals, type LoadedProposal } from "@/lib/data";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ left?: string }> }) {
  const { left } = await searchParams;
  const { supabase, userId } = await getOnboardedViewer();
  const all = await loadProposals(supabase);
  const needsMe = all.filter((p) => p.status === "pending" && p.current.merged.meta?.final && !p.people.find((m) => m.id === userId)?.accepted);
  const working = all.filter((p) => p.status === "pending" && !needsMe.includes(p));
  const confirmed = all.filter((p) => p.status === "confirmed");
  const ended = all.filter((p) => p.status === "declined" || p.status === "superseded");

  return (
    <>
      <PageHeader title="My trips" subtitle="Your match chats and trips. There are no notifications, so check here." />
      {left === "ended" && <div className="mb-4"><Notice tone="info" title="Match ended." action={<Link href="/matches" className="font-medium text-accent-text underline-offset-4 hover:underline">Look for a new match</Link>} /></div>}
      {left === "1" && <div className="mb-4"><Notice tone="info">You left the trip. Your spot is open for someone else.</Notice></div>}
      {all.length === 0 ? (
        <EmptyState icon={<Inbox />} title="No trips yet"
          action={<div className="flex flex-wrap justify-center gap-2">
            <Link href="/matches" className="inline-flex h-11 items-center rounded-md bg-accent px-4 font-medium text-on-accent hover:bg-accent-hover">See matches</Link>
            <Link href="/discover" className="inline-flex h-11 items-center rounded-md border border-border-interactive bg-surface-raised px-4 font-medium hover:bg-surface-hover">Browse Discover</Link>
          </div>}>
          Tap Interested on a match, or join an open trip on Discover.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          <Section title="Needs you" items={needsMe} userId={userId} empty="You're all caught up." />
          <Section title="Working it out" items={working} userId={userId} />
          <Section title="Confirmed" items={confirmed} userId={userId} />
          <Section title="Ended" items={ended} userId={userId} />
        </div>
      )}
    </>
  );
}

function Section({ title, items, userId, empty }: { title: string; items: LoadedProposal[]; userId: string; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title} <span className="font-normal text-muted">({items.length})</span></h2>
      {!items.length ? <p className="text-sm text-muted">{empty}</p> : (
        <ul className="flex flex-col gap-2">
          {items.map((p) => {
            const t = p.current.merged;
            const others = p.people.filter((m) => m.id !== userId).map((m) => m.display_name);
            return (
              <li key={p.id}>
                <Link href={`/trips/${p.id}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-sm transition-colors duration-150 hover:bg-surface-hover">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{t.destination?.name ?? "Trip"}{t.dates ? ` · ${formatRange(t.dates)}` : ""}</p>
                    <p className="truncate text-sm text-muted">{others.length ? `With ${others.join(", ")}` : "Just you so far"}{p.published && p.status === "confirmed" ? ` · open on Discover` : ""}</p>
                  </div>
                  <Badge tone={p.status === "confirmed" ? "success" : p.status === "pending" ? "highlight" : "neutral"}>
                    {p.status === "pending" ? (t.meta?.final ? "Final plan" : "Chatting") : p.status === "confirmed" ? "Confirmed" : "Ended"}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
