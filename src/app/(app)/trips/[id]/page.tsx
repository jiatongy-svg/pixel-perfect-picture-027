// Confirmed itinerary: only exists once every member accepted the same version.
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getOnboardedViewer, loadProposals } from "@/lib/data";
import type { MergedTrip } from "@/lib/merge";
import { TripView } from "@/components/TripView";
import { Notice, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await getOnboardedViewer();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data } = await supabase.from("confirmed_itineraries").select("version, merged, confirmed_at").eq("proposal_id", id).maybeSingle();
  const [p] = await loadProposals(supabase, id);
  if (!data || !p) notFound();
  const others = p.people.filter((m) => m.id !== userId).map((m) => m.display_name);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Confirmed trip" subtitle={`With ${others.join(", ")} · version ${data.version}`} />
      <Notice tone="success" title="Everyone accepted this version.">
        <span className="inline-flex items-center gap-1"><CheckCircle2 aria-hidden className="size-4" /> Confirmed {new Date(data.confirmed_at).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "America/Los_Angeles" })}. Coordinate bookings together — nothing has been booked for you.</span>
      </Notice>
      <TripView trip={data.merged as MergedTrip} />
      <Link href={`/proposals/${id}`} className="self-start rounded-sm text-sm font-medium text-accent-text underline-offset-4 hover:underline">See version history</Link>
    </div>
  );
}
