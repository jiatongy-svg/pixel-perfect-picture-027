// ============================================================================
// TripView — renders a merged itinerary: decisions, transport, gear, a
// suggested day-by-day outline, and the cost estimate. Used on the proposal
// page and the confirmed trip page. Pure display, no state.
// ============================================================================
import { Backpack, CarFront, Lightbulb, Plane, Route, Sparkles } from "lucide-react";
import { formatRange } from "@/lib/dates";
import type { CostLine, MergedTrip } from "@/lib/merge";
import { Badge, Card, Notice } from "@/components/ui";

const money = ([lo, hi]: [number, number]) => (lo === hi ? `$${lo.toLocaleString()}` : `$${lo.toLocaleString()}–$${hi.toLocaleString()}`);

export function TripView({ trip }: { trip: MergedTrip }) {
  const TransportIcon = trip.transport.mode === "fly" ? Plane : CarFront;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-muted">{formatRange(trip.dates)} · {trip.days} {trip.days === 1 ? "day" : "days"}</p>
            <h2 className="text-xl font-semibold">{trip.destination.name}</h2>
          </div>
          {trip.source === "ai" && <Badge tone="info"><Sparkles aria-hidden className="size-3" /> AI-assisted</Badge>}
        </div>
        <p className="mt-2">{trip.summary}</p>
        {trip.notice && <div className="mt-3"><Notice tone="info">{trip.notice}</Notice></div>}
        <h3 className="mt-4 mb-2 flex items-center gap-2 text-sm font-semibold"><Lightbulb aria-hidden className="size-4 text-muted" /> Why this plan</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {trip.decisions.map((d) => <li key={d} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />{d}</li>)}
        </ul>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="mb-2 flex items-center gap-2 font-semibold"><TransportIcon aria-hidden className="size-4 text-muted" /> Getting there</h3>
          <p className="text-sm">{trip.transport.text}</p>
        </Card>
        <Card>
          <h3 className="mb-2 flex items-center gap-2 font-semibold"><Backpack aria-hidden className="size-4 text-muted" /> Gear</h3>
          {trip.gear.length === 0 ? <p className="text-sm text-muted">Nobody listed gear for this trip.</p> : (
            <ul className="flex flex-col gap-1 text-sm">
              {trip.gear.map((g) => <li key={g.item}><span className="font-medium">{g.label}</span> — {g.bringers.join(", ")}</li>)}
            </ul>
          )}
          {trip.missingGear.length > 0 && <p className="mt-2 text-sm text-muted">Useful here, nobody listed: {trip.missingGear.join(", ").toLowerCase()}.</p>}
        </Card>
      </div>

      <Card>
        <h3 className="flex items-center gap-2 font-semibold"><Route aria-hidden className="size-4 text-muted" /> Suggested outline</h3>
        <p className="mb-3 text-sm text-muted">A starting point, not live venue data. Check hours, permits and prices yourselves.</p>
        <ol className="flex flex-col gap-2">
          {trip.outline.map((d) => (
            <li key={d.day} className="flex gap-3 text-sm">
              <span className="w-24 shrink-0 font-medium text-muted">{d.date}</span>
              <span className="min-w-0">{d.title}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Cost estimate</h3>
          <Badge tone="warning">Estimate — not live quotes</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">{trip.costs.split}. For {trip.costs.people} people, {trip.costs.days} days.</p>
        <CostTable title="Shared (split evenly)" lines={trip.costs.shared} />
        <CostTable title="Individual" lines={trip.costs.individual} />
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3">
          <span className="font-semibold">Estimated total per person</span>
          <span className="text-lg font-bold">{money(trip.costs.perPersonTotal)}</span>
        </div>
        {trip.costs.budgetNote && <div className="mt-3"><Notice tone="warning">{trip.costs.budgetNote}</Notice></div>}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer rounded-sm font-medium text-accent-text">Assumptions</summary>
          <ul className="mt-2 list-disc pl-5 text-muted">{trip.costs.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </details>
      </Card>
    </div>
  );
}

function CostTable({ title, lines }: { title: string; lines: CostLine[] }) {
  return (
    <div className="mt-4">
      <h4 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h4>
      <table className="w-full text-sm">
        <thead className="sr-only"><tr><th>Item</th><th>Per person</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className="border-b border-border last:border-0">
              <td className="py-2 pr-3 align-top">
                <span className="font-medium">{l.label}</span>
                <span className="block text-xs text-muted">{l.note}</span>
              </td>
              <td className="py-2 text-right align-top whitespace-nowrap tabular-nums">{money(l.perPerson)}<span className="block text-xs text-muted">per person</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
