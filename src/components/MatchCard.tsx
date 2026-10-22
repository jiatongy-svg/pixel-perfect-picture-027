"use client";
// ============================================================================
// One match card (a classmate, or a group). Shows the score, the reasons
// (always built from real plan data), a plan snapshot, and Propose / Pass.
// Proposing counts as YOUR acceptance of version 1 — the button says so.
// ============================================================================
import Link from "next/link";
import { useState, useTransition } from "react";
import { Car, MapPin, CalendarDays, Wallet, ArrowRight } from "lucide-react";
import { passMatch, proposeTrip } from "@/app/actions";
import { budgetText, styleText, whenText, whereText } from "@/lib/describe";
import type { Place } from "@/lib/places";
import type { Mbti, Person } from "@/lib/types";
import { DestinationImage } from "@/components/DestinationImage";
import { Avatar, Badge, Button, Card, Notice } from "@/components/ui";

type Props = {
  kind: "pair" | "group";
  score: number;
  reasons: string[];
  members: { person: Person; photo: string | null }[];
  targetKey: string;
  openProposalId: string | null;
  today: string;
  place: Place | null; // best shared destination, for the photo
  myPlanId: string; // which of my plans this match is for
  myPlanName: string | null; // shown when I have more than one plan
  viewerMbti: Mbti | null;
};

// Shared MBTI letters (0–4). Just for fun: it never affects the score.
const sharedLetters = (a: string, b: string) => [...a].filter((ch, i) => ch === b[i]).length;

export function MatchCard({ kind, score, reasons, members, targetKey, openProposalId, today, place, viewerMbti, myPlanId, myPlanName }: Props) {
  const [proposing, startPropose] = useTransition();
  const [passing, startPass] = useTransition();
  const [error, setError] = useState<{ text: string; conflicts?: string[] } | null>(null);
  const busy = proposing || passing;
  const title = members.map((m) => m.person.name).join(kind === "group" ? ", " : "");

  function propose() {
    setError(null);
    startPropose(async () => {
      const r = await proposeTrip(myPlanId, members.map((m) => m.person.plan.id));
      // On success the server redirects to the new proposal.
      if (r && !r.ok) setError({ text: r.error, conflicts: r.conflicts });
    });
  }
  function pass() {
    setError(null);
    startPass(async () => {
      const r = await passMatch(targetKey);
      if (!r.ok) setError({ text: r.error });
    });
  }

  return (
    <Card as="article" className="flex h-full flex-col gap-4">
      {place && <DestinationImage place={place} />}
      {myPlanName && <p className="-mb-2 text-xs font-medium text-accent-text">For your plan: {myPlanName}</p>}
      <header className="flex items-start gap-3">
        {kind === "pair" ? (
          <Avatar name={members[0].person.name} url={members[0].photo} />
        ) : (
          <div className="flex shrink-0 -space-x-3" aria-hidden>
            {members.map((m) => <span key={m.person.id} className="rounded-full ring-2 ring-[var(--surface-raised)]"><Avatar name={m.person.name} url={m.photo} size={40} /></span>)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-accent-text" title={kind === "group" ? `You, ${title}` : title}>{kind === "group" ? `You, ${title}` : title}</h3>
          <p className="text-sm text-muted">
            {kind === "pair" ? `MSBA ${members[0].person.msbaYear} year · ${styleText(members[0].person)}` : `${members.length + 1} people · ${members.map((m) => `${m.person.msbaYear} yr`).join(", ")}`}
          </p>
        </div>
        <Badge tone="highlight">{score}% match</Badge>
      </header>

      <ul className="flex flex-col gap-1.5 text-sm">
        {reasons.map((r) => (
          <li key={r} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />{r}</li>
        ))}
      </ul>

      {kind === "pair" && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-md bg-surface-sunken p-3 text-sm sm:grid-cols-2">
          <Snap icon={<MapPin className="size-4" />} label="Where" value={whereText(members[0].person.plan)} />
          <Snap icon={<CalendarDays className="size-4" />} label="When" value={whenText(members[0].person.plan, today)} />
          <Snap icon={<Wallet className="size-4" />} label="Budget" value={budgetText(members[0].person.plan)} />
          {members[0].person.plan.bringing_car && <Snap icon={<Car className="size-4" />} label="Car" value={`${members[0].person.plan.seats_offered} open seats`} />}
        </dl>
      )}

      {(() => {
        const them = members.filter((m) => m.person.profile.mbti);
        if (!them.length) return null;
        return (
          <p className="text-xs text-muted">
            MBTI: {them.map((m) => `${kind === "group" ? `${m.person.name} ` : ""}${m.person.profile.mbti}${viewerMbti ? ` (${sharedLetters(viewerMbti, m.person.profile.mbti!)}/4 letters like you)` : ""}`).join(" · ")}
          </p>
        );
      })()}

      {error && (
        <Notice tone="error" title={error.text}>
          {error.conflicts && <ul className="list-disc pl-4">{error.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>}
        </Notice>
      )}

      <footer className="mt-auto flex flex-col gap-2">
        {openProposalId ? (
          <Link href={`/proposals/${openProposalId}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border-interactive bg-surface-raised px-4 font-medium hover:bg-surface-hover">
            View open proposal <ArrowRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={propose} loading={proposing} disabled={busy}>Propose a trip</Button>
              <Button variant="ghost" onClick={pass} loading={passing} disabled={busy} aria-label={`Pass on ${kind === "group" ? "this group" : title}`}>Pass</Button>
            </div>
            <p className="text-xs text-muted">Proposing builds a merged plan and counts as your acceptance of version 1. Pass hides this only for you.</p>
          </>
        )}
      </footer>
    </Card>
  );
}

function Snap({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="shrink-0 text-muted"><span aria-hidden>{icon}</span><span className="sr-only">{label}</span></dt>
      <dd className="m-0 truncate" title={value}>{value}</dd>
    </div>
  );
}
