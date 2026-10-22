// ============================================================================
// Proposal detail: who has accepted the current version, the merged trip,
// Accept / Counter / Decline, every member's plan snapshot, and version history.
// ============================================================================
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { findDestination, vibeLabel } from "@/lib/catalog";
import { todayLA } from "@/lib/dates";
import { budgetText, whenText, whereText } from "@/lib/describe";
import { dateFit, destinationFit } from "@/lib/feasibility";
import { getOnboardedViewer, loadPeople, loadProposals, photoUrls } from "@/lib/data";
import { ProposalActions } from "@/components/ProposalActions";
import { TripView } from "@/components/TripView";
import { Avatar, Badge, Card, Notice, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ existing?: string }> }) {
  const { id } = await params;
  const { existing } = await searchParams;
  const { supabase, userId } = await getOnboardedViewer();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p] = await loadProposals(supabase, id); // RLS: members only
  if (!p) notFound();

  const today = todayLA();
  const me = p.people.find((m) => m.id === userId)!;
  const creator = p.people.find((m) => m.id === p.created_by)?.display_name ?? "A classmate";
  const urls = await photoUrls(supabase, p.people.map((m) => m.photo_path));

  // Counter options come from everyone's CURRENT plans (what's still feasible).
  const live = await loadPeople(supabase, p.people.map((m) => m.id));
  const plans = live.map((x) => x.plan);
  const options = live.length === p.people.length ? destinationFit(plans).common.map((d) => ({ id: d, name: findDestination(d)!.name })) : [];
  const window = live.length === p.people.length ? dateFit(plans, today).overlap : null;
  const trip = p.current.merged;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Trip with ${p.people.filter((m) => m.id !== userId).map((m) => m.display_name).join(", ")}`}
        subtitle={`Proposed by ${p.created_by === userId ? "you" : creator} · version ${p.current_version}`}
        action={<Badge tone={p.status === "pending" ? "gold" : p.status === "confirmed" ? "success" : "neutral"}>{p.status[0].toUpperCase() + p.status.slice(1)}</Badge>}
      />

      {existing && <Notice tone="info">There was already an open proposal for this group, so we opened it instead of creating a duplicate.</Notice>}
      {p.status === "confirmed" && (
        <Notice tone="success" title="Everyone accepted — this trip is confirmed."
          action={<Link href={`/trips/${p.id}`} className="inline-flex items-center gap-1 font-medium text-accent-text underline-offset-4 hover:underline">View the confirmed itinerary <ArrowRight aria-hidden className="size-4" /></Link>} />
      )}
      {p.status === "declined" && (
        <Notice tone="warning" title={`Declined by ${p.declined_by === userId ? "you" : p.people.find((m) => m.id === p.declined_by)?.display_name ?? "a member"}.`}>
          You can propose again from Matches if plans change.
        </Notice>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Acceptance for version {p.current_version}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {p.people.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <Avatar name={m.display_name} url={m.photo_path ? urls[m.photo_path] : null} size={36} />
              <span className="min-w-0 flex-1 truncate font-medium">{m.id === userId ? `${m.display_name} (you)` : m.display_name}</span>
              {m.accepted
                ? <span className="inline-flex items-center gap-1 text-sm font-medium text-success-text"><CheckCircle2 aria-hidden className="size-4" /> Accepted</span>
                : <span className="inline-flex items-center gap-1 text-sm text-muted"><Circle aria-hidden className="size-4" /> Not yet</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">The trip is confirmed only when everyone accepts the same version. A counter starts a new version and earlier acceptances stop counting.</p>
      </Card>

      {p.status === "pending" && (
        <ProposalActions
          proposalId={p.id}
          version={p.current_version}
          iAccepted={me.accepted}
          current={{ destinationId: trip.destination.id, start: trip.dates.start, end: trip.dates.end }}
          destinationOptions={options.length ? options : [{ id: trip.destination.id, name: trip.destination.name }]}
          window={window}
        />
      )}

      {p.current.note && <Notice tone="info" title={`Note with v${p.current_version}`}>{p.current.note}</Notice>}
      <TripView trip={trip} />

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Everyone's plans (as of v{p.current_version})</h2>
        <div className="flex flex-col gap-2">
          {p.current.snapshots.map((s) => (
            <details key={s.user_id} className="rounded-md border border-border p-3">
              <summary className="cursor-pointer rounded-sm font-medium">{s.user_id === userId ? "Your plan" : `${s.name}'s plan`}</summary>
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted">Where</dt><dd className="m-0">{whereText(s.plan)}</dd>
                <dt className="text-muted">When</dt><dd className="m-0">{whenText(s.plan, today)}</dd>
                <dt className="text-muted">Budget</dt><dd className="m-0">{budgetText(s.plan)}</dd>
                <dt className="text-muted">Vibes</dt><dd className="m-0">{s.plan.vibes.map(vibeLabel).join(", ") || "None picked"}</dd>
                <dt className="text-muted">Bringing</dt><dd className="m-0">{[s.plan.bringing_car && `car (${s.plan.seats_offered} seats)`, ...s.plan.bringing_gear.map((g) => g.replace("_", " "))].filter(Boolean).join(", ") || "Nothing listed"}</dd>
              </dl>
            </details>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Version history</h2>
        <ol className="flex flex-col gap-3">
          {[...p.versions].reverse().map((v) => (
            <li key={v.version} className="flex gap-3 text-sm">
              <Badge tone={v.version === p.current_version ? "gold" : "neutral"}>v{v.version}</Badge>
              <div className="min-w-0">
                <p><span className="font-medium">{v.created_by === userId ? "You" : p.people.find((m) => m.id === v.created_by)?.display_name}</span> {v.version === 1 ? "proposed" : "countered"}: {v.merged.summary}</p>
                {v.note && <p className="text-muted">“{v.note}”</p>}
                <p className="text-xs text-muted">{new Date(v.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" })}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
