// ============================================================================
// The trip room — one page for a trip at every stage:
//   Working it out: group chat + checklist + "send the final plan" + accept
//   Confirmed:      the plan, contacts, calendar export, Discover spots
//   Ended:          what happened, and a way back to Matches
// Members see each other's names here. Anyone can leave with one tap.
// ============================================================================
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, CheckCircle2, Circle, Mail, Users } from "lucide-react";
import { getMessages } from "@/app/actions";
import { todayLA } from "@/lib/dates";
import { getOnboardedViewer, loadProposals, photoUrls, proposalPeople } from "@/lib/data";
import { dateFit, destinationFit } from "@/lib/feasibility";
import { fitsRange, prefLabel } from "@/lib/groupsize";
import { placeLabel } from "@/lib/places";
import { AcceptButton, FinalPlanForm } from "@/components/FinalPlanForm";
import { TripChat } from "@/components/TripChat";
import { GroupGrewNotice, LeaveButton } from "@/components/TripButtons";
import { TripView } from "@/components/TripView";
import { Avatar, Badge, Card, Notice, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const PROMPTS = ["Are you willing to move your dates, or should I move mine?", "Do we want to go together?", "Do we want more people?", "Who's driving?"];

export default async function TripRoom({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, userId, profile } = await getOnboardedViewer();
  const [p] = await loadProposals(supabase, id); // members only (RLS)
  if (!p) notFound();

  const today = todayLA();
  const me = p.people.find((m) => m.id === userId)!;
  const trip = p.current.merged;
  const isFinal = !!trip.meta?.final;
  const pending = p.status === "pending";
  const confirmed = p.status === "confirmed";
  const urls = await photoUrls(supabase, p.people.map((m) => m.photo_path));

  const [messages, { data: mine }, contacts, live, { data: booked }] = await Promise.all([
    getMessages(id),
    supabase.from("proposal_members").select("ack_size").eq("proposal_id", id).eq("user_id", userId).maybeSingle(),
    confirmed ? supabase.rpc("trip_contacts", { p_proposal: id }) : Promise.resolve({ data: [] }),
    pending ? proposalPeople(supabase, p) : Promise.resolve(null),
    pending ? supabase.rpc("booked_member", { p_proposal: id }) : Promise.resolve({ data: null }),
  ]);
  // One plan, one confirmed trip: if someone's plan got booked elsewhere, this one can't be confirmed.
  const bookedName = (booked as string | null) ?? null;
  const canSettle = pending && !bookedName;

  // "The group grew beyond your preferred size."
  const myPref = p.trip_kind === "weekend" ? profile.group_pref_weekend : profile.group_pref_long;
  const grew = (mine?.ack_size ?? p.size) < p.size && !fitsRange(p.size, myPref);

  // Options for the final-plan checklist come from everyone's current plans.
  const plans = live?.map((x) => x.plan) ?? [];
  const options = live ? destinationFit(plans).common.slice(0, 30).map((c) => ({ id: c.key, name: placeLabel(c) })) : [];
  const window = live ? dateFit(plans, today).overlap : null;
  const spotsLeft = p.capacity ? Math.max(0, p.capacity - p.size) : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={trip.destination?.name ?? "Trip"}
        subtitle={`${p.size} ${p.size === 1 ? "person" : "people"}${trip.summary ? ` · ${trip.summary}` : ""}`}
        action={<Badge tone={pending ? "highlight" : confirmed ? "success" : "neutral"}>{pending ? "Working it out" : confirmed ? "Confirmed" : "Ended"}</Badge>}
      />

      {sp.new && <Notice tone="success" title="It's a match! Everyone was interested.">Say hi below and use the checklist to lock in the plan.</Notice>}
      {sp.joined && <Notice tone="success" title="You're in.">You joined this trip as it is. Say hi to the group below.</Notice>}
      {sp.published && <Notice tone="success" title="Posted to Discover.">Classmates can now join your trip until sign-ups close.</Notice>}
      {grew && <GroupGrewNotice tripId={id} size={p.size} prefLabel={prefLabel(myPref)} />}
      {bookedName && (
        <Notice tone="warning" title={bookedName === me.display_name ? "Your plan for this trip is already booked." : `${bookedName}'s plan for this trip is already booked.`}>
          {bookedName === me.display_name
            ? "You confirmed another trip with this plan, so this one can't be confirmed. Leave this trip below, or leave the other one first."
            : `${bookedName} confirmed another trip with the same plan, so this one can't be confirmed unless they leave that trip. You can keep chatting or leave.`}
        </Notice>
      )}
      {p.status === "declined" && (
        <Notice tone="warning" title="This match ended." action={<Link href="/matches" className="font-medium text-accent-text underline-offset-4 hover:underline">Look for a new match</Link>}>
          The group couldn&apos;t agree on a plan, or everyone left. No problem — your plans are still active.
        </Notice>
      )}

      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Users aria-hidden className="size-5 text-muted" /> Who&apos;s going</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {p.people.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <Avatar name={m.display_name} url={m.photo_path ? urls[m.photo_path] : null} size={36} />
              <span className="min-w-0 flex-1 truncate font-medium">{m.id === userId ? `${m.display_name} (you)` : m.display_name}</span>
              {pending && isFinal && (m.accepted
                ? <span className="inline-flex items-center gap-1 text-sm text-success-text"><CheckCircle2 aria-hidden className="size-4" /> Accepted</span>
                : <span className="inline-flex items-center gap-1 text-sm text-muted"><Circle aria-hidden className="size-4" /> Not yet</span>)}
            </li>
          ))}
        </ul>
        {confirmed && p.published && (
          <p className="mt-3 text-sm text-muted">Open on Discover: {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left{p.join_deadline ? `, sign-ups close ${new Date(p.join_deadline).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}` : ""}.</p>
        )}
      </Card>

      {canSettle && isFinal && !me.accepted && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">The final plan is in — do you accept?</h2>
          <p className="text-sm text-muted">{trip.summary}{trip.meta?.wantMore ? ` · Open to ${trip.meta.extraSpots} more ${trip.meta.extraSpots === 1 ? "person" : "people"} on Discover` : " · Just this group"}</p>
          <AcceptButton tripId={id} version={p.current_version} />
        </Card>
      )}

      {p.status !== "declined" && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Group chat</h2>
          <TripChat tripId={id} initial={messages} prompts={pending ? PROMPTS : []} />
        </Card>
      )}

      {canSettle && live && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">{isFinal ? "Change the final plan" : "Lock in the plan"}</h2>
          <p className="mb-4 text-sm text-muted">After you&apos;ve talked it through, one person fills this in for the group.</p>
          <FinalPlanForm tripId={id} version={p.current_version}
            current={{ destinationId: trip.destination?.id ?? options[0]?.id ?? "", start: trip.dates?.start ?? window?.start ?? today, end: trip.dates?.end ?? window?.end ?? today }}
            destinationOptions={options.length ? options : trip.destination ? [{ id: trip.destination.id, name: trip.destination.name }] : []} window={window} />
        </Card>
      )}

      {confirmed && (
        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Mail aria-hidden className="size-5 text-muted" /> Contacts</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {((contacts.data ?? []) as { user_id: string; name: string; email: string; contact: string }[]).map((c) => (
              <li key={c.user_id} className="break-words"><span className="font-medium">{c.name}</span> · <a href={`mailto:${c.email}`} className="text-accent-text underline-offset-4 hover:underline">{c.email}</a>{c.contact ? ` · ${c.contact}` : ""}</li>
            ))}
          </ul>
          <p className="text-xs text-muted">Only people on this trip see these. Add a phone or WeChat on your <Link href="/profile?edit=1" className="underline-offset-4 hover:underline">profile</Link>.</p>
          <a href={`/trips/${id}/calendar`} className="inline-flex h-11 w-fit items-center gap-2 rounded-md border border-border-interactive bg-surface-raised px-4 text-sm font-medium hover:bg-surface-hover">
            <CalendarPlus aria-hidden className="size-4" /> Add to my calendar
          </a>
        </Card>
      )}

      <h2 className="text-lg font-semibold">{confirmed ? "The plan" : isFinal ? "Proposed final plan" : "Suggested plan (a starting point)"}</h2>
      {trip.destination ? <TripView trip={trip} /> : <Notice tone="info">{trip.summary}</Notice>}

      {p.status !== "declined" && <LeaveButton tripId={id} pendingMatch={pending} />}
    </div>
  );
}
