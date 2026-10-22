import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listMyPlans } from "@/lib/trip.functions";
import type { TripProfile } from "@/lib/trip-data";
import { readDemoTrip } from "@/lib/local-demo";
export function MyPlans({ profile }: { profile: (TripProfile & { localOnly?: boolean }) | null }) {
  const load = useServerFn(listMyPlans);
  const [plans, setPlans] = useState<{ id: string; status: string; destination: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let ids: string[] = [];
    try { const stored = JSON.parse(localStorage.getItem("tm_demo_trip_ids") ?? "[]"); if (Array.isArray(stored)) ids = stored.filter((id): id is string => typeof id === "string"); } catch { /* Ignore an invalid local draft. */ }
    const local = ids.flatMap((id) => { const trip = readDemoTrip(id); return trip ? [{ id, status: "Demo confirmed", destination: trip.merged.destination }] : []; });
    setPlans(local);
    if (profile && !profile.localOnly) void load({ data: { profileId: profile.id } }).then((items) => { if (active) setPlans([...items.map((item) => ({ id: item.id, status: item.status === "accepted" ? "Matched" : item.status === "passed" ? "Closed" : "Waiting for both travelers", destination: (item.merged as { destination?: string })?.destination ?? "Trip" })), ...local]); }).catch(() => { if (active) setError("Shared plans could not load. Please check your sign-in or try again."); });
    return () => { active = false; };
  }, [profile, load]);
  return <><h1 className="text-3xl font-extrabold">My plans & invitations</h1><p className="mt-2 text-sm text-muted-foreground">Both travelers must accept a real plan before chat unlocks.</p>{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}<div className="mt-5 space-y-3">{!plans.length && <p className="text-sm text-muted-foreground">No plans yet. Explore trips to find one you’d like to join.</p>}{plans.map((plan) => <Link key={plan.id} to="/trip/$id" params={{ id: plan.id }} className="block rounded-2xl border border-border bg-card p-4"><span className="font-bold">{plan.destination}</span><span className="mt-1 block text-sm text-muted-foreground">{plan.status}</span></Link>)}</div></>;
}
