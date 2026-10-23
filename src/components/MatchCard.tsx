"use client";
// ============================================================================
// One potential trip on the Match page — two people or a group, in one list.
// Anonymous until everyone taps "Interested"; then a group chat opens and
// names are shared. Shows the score, why it fits, and what someone would need
// to adjust ("you'd need to shift your dates a bit").
// ============================================================================
import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, CalendarDays, Check, Info, MapPin, Users, Wallet } from "lucide-react";
import { expressInterest, passMatch, withdrawInterest } from "@/app/actions";
import { PACE, vibeLabel } from "@/lib/catalog";
import { formatRange } from "@/lib/dates";
import { budgetText } from "@/lib/describe";
import { placeLabel, type Place } from "@/lib/places";
import type { DateRange, PublicPlan } from "@/lib/types";
import { DestinationImage } from "@/components/DestinationImage";
import { Badge, Button, Card, Notice } from "@/components/ui";

export type MatchCardData = {
  key: string; // sorted plan ids, including mine
  score: number;
  reasons: string[];
  hints: string[];
  trip: DateRange | null;
  place: Place | null;
  size: number;
  others: { plan: PublicPlan; pace: string }[]; // anonymous: plan + travel style only
  myPlanName: string | null; // when I have more than one plan
  interested: number; // how many have tapped Interested (incl. me)
  iAmInterested: boolean;
  openTripId: string | null; // a chat already exists for this set of plans
};

export function MatchCard({ m }: { m: MatchCardData }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string } | undefined>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r && !r.ok) setMsg({ tone: "error", text: r.error ?? "Something went wrong." });
      else if (r?.message) setMsg({ tone: "success", text: r.message });
    });
  }

  return (
    <Card as="article" className="flex h-full flex-col gap-3">
      {m.place && <DestinationImage place={m.place} />}
      {m.myPlanName && <p className="text-xs font-medium text-accent-text">For your plan: {m.myPlanName}</p>}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs text-muted"><Users aria-hidden className="size-3.5" />
            {m.size === 2 ? "You + 1 anonymous classmate" : `You + ${m.size - 1} anonymous classmates`}
          </p>
          <h3 className="text-lg leading-snug font-semibold break-words">{m.place ? placeLabel(m.place) : "Somewhere you both like"}</h3>
        </div>
        <Badge tone="highlight">{m.score}% match</Badge>
      </header>

      <dl className="grid gap-1.5 text-sm">
        {m.trip && <Row icon={<CalendarDays className="size-4" />} label="Suggested dates" value={formatRange(m.trip)} />}
        {m.others.map((o, i) => (
          <Row key={o.plan.id} icon={<MapPin className="size-4" />} label={`Classmate ${i + 1}`}
            value={`${m.others.length > 1 ? `Classmate ${i + 1}: ` : ""}${PACE.find((p) => p.id === o.pace)?.label ?? "Balanced"} pace${o.plan.vibes.length ? ` · ${o.plan.vibes.map(vibeLabel).join(", ")}` : ""}`} />
        ))}
        <Row icon={<Wallet className="size-4" />} label="Their budget" value={m.others.map((o) => budgetText(o.plan)).join(" · ")} />
      </dl>

      <ul className="flex flex-col gap-1 text-sm">
        {m.reasons.slice(0, 3).map((r) => <li key={r} className="flex gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />{r}</li>)}
        {m.hints.map((h) => <li key={h} className="flex gap-2 text-warning-text"><Info aria-hidden className="mt-0.5 size-4 shrink-0" />{h}</li>)}
      </ul>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <footer className="mt-auto flex flex-col gap-2 pt-1">
        {m.openTripId ? (
          <Link href={`/trips/${m.openTripId}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 font-medium text-on-accent hover:bg-accent-hover">
            Open the group chat <ArrowRight aria-hidden className="size-4" />
          </Link>
        ) : m.iAmInterested ? (
          <>
            <p className="rounded-md bg-accent-subtle px-3 py-2 text-sm text-accent-text">
              You&apos;re interested · {m.interested} of {m.size}. The chat opens when everyone is.
            </p>
            <Button variant="ghost" size="sm" loading={pending} onClick={() => run(() => withdrawInterest(m.key))}>Not interested anymore</Button>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <Button className="flex-1" loading={pending} onClick={() => run(() => expressInterest(m.key))}>
                Interested{m.interested > 0 ? ` · ${m.interested} already are` : ""}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => run(() => passMatch(m.key))}>Pass</Button>
            </div>
            <p className="text-xs text-muted">When everyone taps Interested, a group chat opens and you see each other&apos;s names. Pass hides this only for you.</p>
          </>
        )}
      </footer>
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
