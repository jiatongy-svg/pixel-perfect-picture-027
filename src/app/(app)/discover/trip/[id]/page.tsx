// ============================================================================
// An open trip from Discover, before joining: the full plan and each member's
// travel style — no names or photos. Join instantly while spots remain.
// ============================================================================
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Car, Clock, Gauge, Users } from "lucide-react";
import { EXPERIENCE, PACE, SCHEDULE, vibeLabel } from "@/lib/catalog";
import { getOnboardedViewer } from "@/lib/data";
import { spotsLeft, strictBlocks, styleSignal, type OpenTrip } from "@/lib/discover";
import { prefLabel } from "@/lib/groupsize";
import { TripView } from "@/components/TripView";
import { JoinButton } from "@/components/TripButtons";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const label = (list: readonly { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;

export default async function OpenTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, profile } = await getOnboardedViewer();
  const { data } = await supabase.from("open_trips").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const trip = data as OpenTrip;
  if (trip.is_member) redirect(`/trips/${id}`);

  const left = spotsLeft(trip);
  const blocked = strictBlocks(profile, trip);
  const reason = left === 0 ? "This trip is full." : blocked ? `Joining would make ${trip.size + 1} people, outside your strict preference (${prefLabel(blocked)}). You can change it on your profile.` : null;
  const signal = styleSignal(profile, trip.members);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/discover" className="inline-flex w-fit items-center gap-1 rounded-sm text-sm font-medium text-muted hover:text-text"><ArrowLeft aria-hidden className="size-4" /> Discover</Link>
      <PageHeader title={trip.merged.destination?.name ?? "Open trip"} subtitle="This trip is happening. Join if you want — the plan stays as it is." />

      <Card className="flex flex-col gap-4">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2"><Users aria-hidden className="size-4 text-muted" /> {trip.size} going · {left} {left === 1 ? "spot" : "spots"} left</p>
          {trip.join_deadline && <p className="flex items-center gap-2"><Clock aria-hidden className="size-4 text-muted" /> Sign-ups close {new Date(trip.join_deadline).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}</p>}
        </div>
        {signal && <p className="text-sm text-accent-text">{signal}</p>}
        <JoinButton tripId={trip.id} disabledReason={reason} />
      </Card>

      <section aria-labelledby="who">
        <h2 id="who" className="mb-2 text-lg font-semibold">Who&apos;s going</h2>
        <p className="mb-3 text-sm text-muted">Names appear after you join.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {trip.members.map((m, i) => (
            <li key={i} className="rounded-md border border-border bg-surface-raised p-3 text-sm">
              <p className="font-medium">Classmate {i + 1} · MSBA {m.year} year</p>
              <p className="flex items-center gap-1.5 text-muted"><Gauge aria-hidden className="size-4" /> {label(PACE, m.pace)} pace · {label(SCHEDULE, m.schedule)} · {label(EXPERIENCE, m.experience)}</p>
              {m.vibes?.length > 0 && <p className="text-muted">Into {m.vibes.map(vibeLabel).join(", ")}</p>}
              {(m.has_car || m.can_drive) && <p className="flex items-center gap-1.5 text-muted"><Car aria-hidden className="size-4" /> {m.has_car ? "Has a car" : "Can drive"}</p>}
            </li>
          ))}
        </ul>
      </section>

      <TripView trip={trip.merged} />
    </div>
  );
}
