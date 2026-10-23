// ============================================================================
// An open trip on Discover: "this is happening — join if you want".
// Anonymous: shows the trip and each member's travel style, never names.
// Shows spots left and when sign-ups close. The whole card opens the trip.
// ============================================================================
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, Sparkles, Users } from "lucide-react";
import { formatRange } from "@/lib/dates";
import { spotsLeft, type OpenTrip } from "@/lib/discover";
import { DestinationImage } from "@/components/DestinationImage";
import { Badge, Card } from "@/components/ui";

export function OpenTripCard({ trip, signal, blocked }: { trip: OpenTrip; signal: string | null; blocked: boolean }) {
  const m = trip.merged;
  const left = spotsLeft(trip);
  return (
    <Card as="article" className="relative flex h-full flex-col gap-3 p-3 transition-shadow duration-150 hover:shadow-md sm:p-4">
      {m.destination?.place && <DestinationImage place={m.destination.place} />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Happening · join if you want</p>
          <h3 className="text-lg leading-snug font-semibold break-words">
            <Link href={`/discover/trip/${trip.id}`} className="rounded-sm after:absolute after:inset-0 after:content-['']">{m.destination?.name ?? "Trip"}</Link>
          </h3>
        </div>
        {trip.is_member ? <Badge tone="success">You&apos;re in</Badge> : <Badge tone="highlight">{left} {left === 1 ? "spot" : "spots"} left</Badge>}
      </div>
      <dl className="grid gap-1.5 text-sm">
        {m.dates && <Row icon={<CalendarDays className="size-4" />} label="Dates" value={`${formatRange(m.dates)} · ${m.days} days`} />}
        <Row icon={<Users className="size-4" />} label="Group" value={`${trip.size} going · up to ${trip.capacity}`} />
        {trip.join_deadline && <Row icon={<Clock className="size-4" />} label="Sign-ups close"
          value={`Sign-ups close ${new Date(trip.join_deadline).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}`} />}
        {m.costs && <Row icon={<Sparkles className="size-4" />} label="Estimate" value={`~$${m.costs.perPersonTotal[0]}–$${m.costs.perPersonTotal[1]} per person (estimate)`} />}
      </dl>
      {signal && <p className="text-sm text-accent-text">{signal}</p>}
      {blocked && <p className="text-sm text-warning-text">Joining would go past your strict group-size limit.</p>}
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-accent-text">See the trip <ChevronRight aria-hidden className="size-4" /></span>
    </Card>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <dt className="mt-0.5 shrink-0 text-muted"><span aria-hidden>{icon}</span><span className="sr-only">{label}</span></dt>
      <dd className="m-0 min-w-0 break-words">{value}</dd>
    </div>
  );
}
