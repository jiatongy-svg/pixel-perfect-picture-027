import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Screen } from "@/components/trip/ui";
import { getItinerary } from "@/lib/trip.functions";

export const Route = createFileRoute("/trip/$id")({
  head: () => ({
    meta: [
      { title: "Shared itinerary — TripMatch" },
      { name: "description", content: "Your shared day-by-day trip plan, travelers and cost split." },
      { property: "og:title", content: "Shared itinerary — TripMatch" },
      { property: "og:description", content: "Your shared day-by-day trip plan, travelers and cost split." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TripPage,
});

type Data = Awaited<ReturnType<typeof getItinerary>>;
const fmt = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function TripPage() {
  const { id } = Route.useParams();
  const load = useServerFn(getItinerary);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { load({ data: { proposalId: id } }).then(setData).catch((e) => setErr(String(e?.message ?? e))); }, [id, load]);

  if (err) return <Screen><p className="text-destructive">{err}</p></Screen>;
  if (!data) return <Screen><p className="text-muted-foreground">Loading trip…</p></Screen>;
  const { merged, travelers, itinerary } = data;
  return (
    <Screen step="Trip confirmed">
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-card">
        <div className="text-xs font-semibold uppercase tracking-widest opacity-80">You're going to</div>
        <h1 className="mt-1 text-3xl font-extrabold">{merged.destination}</h1>
        <div className="opacity-90">{fmt(merged.start_date)} – {fmt(merged.end_date)}</div>
      </div>
      <h2 className="mt-6 mb-2 text-lg font-bold">Who's going</h2>
      <div className="flex flex-wrap gap-2">
        {travelers.map((t, i) => (
          <span key={t.id} className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold">{i === 0 ? `${t.first_name} (you)` : t.first_name} · {t.msba_year}</span>
        ))}
      </div>
      <h2 className="mt-6 mb-2 text-lg font-bold">Day by day</h2>
      <ol className="space-y-2">
        {itinerary.days.map((d, i) => (
          <li key={d.date} className="flex gap-3 rounded-2xl bg-card p-3 shadow-card">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground">{i + 1}</span>
            <div><div className="text-xs text-muted-foreground">{fmt(d.date)}</div><div className="font-semibold">{d.activity}</div></div>
          </li>
        ))}
      </ol>
      <h2 className="mt-6 mb-2 text-lg font-bold">Cost split</h2>
      <div className="rounded-2xl border-2 border-border bg-card p-4">
        {travelers.map((t) => (
          <div key={t.id} className="flex justify-between py-1"><span>{t.first_name}</span><span className="font-bold">${itinerary.perPerson}</span></div>
        ))}
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm text-muted-foreground"><span>Estimated total</span><span>${itinerary.total}</span></div>
        {itinerary.needsCar && <p className="mt-2 text-sm text-muted-foreground">🚗 {itinerary.driver ? `${itinerary.driver} drives — gas split evenly.` : "Car needed — consider a rental, split evenly."}</p>}
      </div>
      <Link to="/" className="mt-8 text-center text-sm font-semibold text-primary underline">Find another trip</Link>
    </Screen>
  );
}
