// Proposals list: pending (yours to answer first), confirmed, declined.
// No notifications in this pilot — this page is where you find new proposals.
import Link from "next/link";
import { Inbox } from "lucide-react";
import { formatRange } from "@/lib/dates";
import { getOnboardedViewer, loadProposals, type LoadedProposal } from "@/lib/data";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const { supabase, userId } = await getOnboardedViewer();
  const all = await loadProposals(supabase);
  const pending = all.filter((p) => p.status === "pending");
  const needsMe = pending.filter((p) => !p.people.find((m) => m.id === userId)?.accepted);
  const waiting = pending.filter((p) => !needsMe.includes(p));
  const confirmed = all.filter((p) => p.status === "confirmed");
  const closed = all.filter((p) => p.status === "declined" || p.status === "superseded");

  return (
    <>
      <PageHeader title="Proposals" subtitle="Trips you've proposed or been invited to." />
      {all.length === 0 ? (
        <EmptyState icon={<Inbox />} title="No proposals yet"
          action={<Link href="/matches" className="inline-flex h-11 items-center rounded-md bg-accent px-4 font-medium text-on-accent hover:bg-accent-hover">Browse matches</Link>}>
          When you propose a trip from a match — or a classmate proposes one to you — it shows up here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          <Section title="Needs your response" items={needsMe} userId={userId} empty="You're all caught up." />
          <Section title="Waiting on others" items={waiting} userId={userId} />
          <Section title="Confirmed trips" items={confirmed} userId={userId} />
          <Section title="Declined" items={closed} userId={userId} />
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
            const others = p.people.filter((m) => m.id !== userId).map((m) => m.display_name);
            const trip = p.current.merged;
            const tone = p.status === "confirmed" ? "success" : p.status === "pending" ? "gold" : "neutral";
            return (
              <li key={p.id}>
                <Link href={p.status === "confirmed" ? `/trips/${p.id}` : `/proposals/${p.id}`}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-sm transition-colors duration-150 hover:bg-surface-hover">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{trip.destination.name} · {formatRange(trip.dates)}</p>
                    <p className="truncate text-sm text-muted">With {others.join(", ")} · v{p.current_version} · {p.people.filter((m) => m.accepted).length}/{p.size} accepted</p>
                  </div>
                  <Badge tone={tone}>{p.status === "pending" ? "Pending" : p.status === "confirmed" ? "Confirmed" : "Declined"}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
