import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Chip, GhostButton, Option, PrimaryButton, Screen } from "@/components/trip/ui";
import type { Match } from "@/lib/matching";
import { decide, getMatches, proposeMerge, saveProfile } from "@/lib/trip.functions";
import {
  BREAKS, BUDGETS, DESTINATIONS, VIBES, findDestination,
  type BreakId, type Budget, type Gear, type MergedPlan, type TripProfile, type Vibe,
} from "@/lib/trip-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TripMatch — Find MSBA classmates to travel with" },
      { name: "description", content: "Answer 5 quick questions and get matched with USC Marshall MSBA classmates for your next break trip." },
      { property: "og:title", content: "TripMatch — Find MSBA classmates to travel with" },
      { property: "og:description", content: "Answer 5 quick questions and get matched with USC Marshall MSBA classmates for your next break trip." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

type Step = "signin" | "entry" | 1 | 2 | 3 | 4 | 5 | "matches" | "merge";
type Proposal = { proposalId: string; merged: MergedPlan; source: string; me: TripProfile; them: TripProfile };

const fmt = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const range = (a: string, b: string) => (a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`);

function App() {
  const navigate = useNavigate();
  const save = useServerFn(saveProfile);
  const fetchMatches = useServerFn(getMatches);
  const propose = useServerFn(proposeMerge);
  const decideFn = useServerFn(decide);

  const [step, setStep] = useState<Step>("signin");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"go" | "plan">("go");
  const [breakId, setBreakId] = useState<BreakId | null>(null);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [dests, setDests] = useState<string[]>([]);
  const [custom, setCustom] = useState({ destination: "", start: "", end: "" });
  const [budget, setBudget] = useState<Budget | null>(null);
  const [gear, setGear] = useState<Gear[] | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const e = localStorage.getItem("tm_email");
    if (e) { setEmail(e); setStep("entry"); }
  }, []);

  const total = 5;
  const firstName = (() => {
    const n = email.split("@")[0].split(/[._-]/)[0] ?? "";
    return n ? n[0].toUpperCase() + n.slice(1) : "Trojan";
  })();

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true); setErr(null);
    try { return await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  }

  async function finishOnboarding(g: Gear[]) {
    setGear(g);
    await run(async () => {
      const b = breakId!;
      let start: string, end: string, destinations: string[];
      if (mode === "plan") {
        start = custom.start; end = custom.end || custom.start; destinations = [custom.destination.trim()];
      } else {
        const top = findDestination(b, dests[0])!;
        start = top.start; end = top.end; destinations = dests;
      }
      const p = await save({ data: { email, first_name: firstName, msba_year: "MSBA 2027", break_id: b, vibes, destinations, start_date: start, end_date: end, budget: budget!, gear: g } });
      setProfileId(p.id);
      const r = await fetchMatches({ data: { profileId: p.id } });
      setMatches(r.matches);
      setStep("matches");
    });
  }

  async function openMatch(id: string, override?: { destination?: string; start_date?: string; end_date?: string }) {
    await run(async () => {
      const r = await propose({ data: { profileId: profileId!, matchId: id, override } });
      setProposal(r as Proposal);
      setStep("merge");
    });
  }

  // ---------- Screens ----------
  if (step === "signin") {
    const valid = /^[^@\s]+@usc\.edu$/i.test(email.trim());
    return (
      <Screen>
        <div className="flex flex-1 flex-col justify-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">USC Marshall · MSBA</p>
          <h1 className="text-4xl font-extrabold leading-tight">Break's coming.<br />Find your travel crew.</h1>
          <p className="mt-3 text-muted-foreground">Get matched with classmates — even when your plans don't line up perfectly.</p>
          <label className="mt-10 mb-2 block text-sm font-semibold">USC email</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ttrojan@usc.edu"
            className="h-14 w-full rounded-2xl border-2 border-border bg-card px-4 text-base outline-none focus:border-primary"
          />
          {email && !valid && <p className="mt-2 text-sm text-destructive">Use your @usc.edu address.</p>}
          <PrimaryButton className="mt-4" disabled={!valid} onClick={() => { const e = email.trim().toLowerCase(); setEmail(e); localStorage.setItem("tm_email", e); setStep("entry"); }}>
            Continue with USC email
          </PrimaryButton>
        </div>
      </Screen>
    );
  }

  if (step === "entry") {
    return (
      <Screen>
        <h1 className="text-3xl font-extrabold">Hi {firstName} 👋</h1>
        <p className="mt-2 text-muted-foreground">Where are you starting from?</p>
        <div className="mt-8 space-y-3">
          <Option onClick={() => { setMode("go"); setStep(1); }}>
            <div className="text-lg font-bold">I want to go somewhere</div>
            <div className="text-sm text-muted-foreground">Pick from popular trips for your break</div>
          </Option>
          <Option onClick={() => { setMode("plan"); setStep(1); }}>
            <div className="text-lg font-bold">I already have a plan</div>
            <div className="text-sm text-muted-foreground">Enter your destination and dates</div>
          </Option>
        </div>
        <button className="mt-auto pt-10 text-sm text-muted-foreground underline" onClick={() => { localStorage.removeItem("tm_email"); setEmail(""); setStep("signin"); }}>
          Not {email}? Sign out
        </button>
      </Screen>
    );
  }

  if (typeof step === "number") {
    const back = () => setStep(step === 1 ? "entry" : ((step - 1) as Step));
    const Q = ({ title, children, next, canNext }: { title: string; children: React.ReactNode; next?: () => void; canNext?: boolean }) => (
      <Screen step={`${step} of ${total}`}>
        <div className="mb-6 h-1.5 w-full rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(step / total) * 100}%` }} /></div>
        <button onClick={back} className="mb-3 self-start text-sm font-semibold text-muted-foreground">← Back</button>
        <h2 className="mb-6 text-2xl font-extrabold">{title}</h2>
        <div className="space-y-3">{children}</div>
        {next && <div className="mt-auto pt-8"><PrimaryButton disabled={!canNext || busy} onClick={next}>{busy ? "Finding matches…" : "Next"}</PrimaryButton></div>}
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </Screen>
    );

    if (step === 1)
      return (
        <Q title="Which break?">
          {BREAKS.map((b) => (
            <Option key={b.id} selected={breakId === b.id} onClick={() => { if (b.id !== breakId) setDests([]); setBreakId(b.id); setStep(2); }}>
              <div className="font-bold">{b.label}</div>
              <div className="text-sm text-muted-foreground">{range(b.start, b.end)}</div>
            </Option>
          ))}
        </Q>
      );

    if (step === 2)
      return (
        <Q title="What's your vibe? (up to 2)" next={() => setStep(3)} canNext={vibes.length > 0}>
          <div className="grid grid-cols-2 gap-3">
            {VIBES.map((v) => {
              const on = vibes.includes(v);
              return (
                <Option key={v} selected={on} onClick={() => setVibes(on ? vibes.filter((x) => x !== v) : vibes.length < 2 ? [...vibes, v] : [vibes[1], v])}>
                  <div className="py-2 text-center font-bold">{v}</div>
                </Option>
              );
            })}
          </div>
        </Q>
      );

    if (step === 3 && mode === "go") {
      const list = DESTINATIONS[breakId!];
      return (
        <Q title="Pick & rank up to 3" next={() => setStep(4)} canNext={dests.length > 0}>
          <p className="-mt-3 text-sm text-muted-foreground">Tap in order of preference.</p>
          {list.map((dst) => {
            const rank = dests.indexOf(dst.name);
            return (
              <Option
                key={dst.name}
                selected={rank >= 0}
                onClick={() => setDests(rank >= 0 ? dests.filter((x) => x !== dst.name) : dests.length < 3 ? [...dests, dst.name] : dests)}
                badge={<span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${rank >= 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{rank >= 0 ? rank + 1 : ""}</span>}
              >
                <div className="font-bold">{dst.name}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  ${dst.min}–{dst.max.toLocaleString()} pp · {dst.car ? "🚗 Car needed" : "No car needed"} · {range(dst.start, dst.end)}
                </div>
              </Option>
            );
          })}
        </Q>
      );
    }

    if (step === 3)
      return (
        <Q title="Your plan" next={() => setStep(4)} canNext={!!custom.destination.trim() && !!custom.start && (!custom.end || custom.end >= custom.start)}>
          <input placeholder="Destination (e.g. Joshua Tree)" value={custom.destination} onChange={(e) => setCustom({ ...custom, destination: e.target.value })}
            list="preset-dests" className="h-14 w-full rounded-2xl border-2 border-border bg-card px-4 outline-none focus:border-primary" />
          <datalist id="preset-dests">{DESTINATIONS[breakId!].map((x) => <option key={x.name} value={x.name} />)}</datalist>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold">Start<input type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="mt-1 h-14 w-full rounded-2xl border-2 border-border bg-card px-3" /></label>
            <label className="text-sm font-semibold">End<input type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="mt-1 h-14 w-full rounded-2xl border-2 border-border bg-card px-3" /></label>
          </div>
        </Q>
      );

    if (step === 4)
      return (
        <Q title="Budget per person?">
          {BUDGETS.map((b) => (
            <Option key={b.id} selected={budget === b.id} onClick={() => { setBudget(b.id); setStep(5); }}>
              <div className="font-bold">{b.label}</div>
            </Option>
          ))}
        </Q>
      );

    return (
      <Q title="Bringing a car or gear?">
        {([["car"], ["tent"], ["car", "tent"], []] as Gear[][]).map((g) => (
          <Option key={g.join() || "none"} selected={gear?.join() === g.join()} onClick={() => !busy && finishOnboarding(g)}>
            <div className="font-bold">{g.length === 0 ? "None" : g.map((x) => (x === "car" ? "🚗 Car" : "⛺ Tent")).join(" + ")}</div>
          </Option>
        ))}
        {busy && <p className="pt-2 text-center text-sm font-semibold text-primary">Finding your matches…</p>}
      </Q>
    );
  }

  if (step === "matches") {
    return (
      <Screen step={BREAKS.find((b) => b.id === breakId)?.label}>
        <h1 className="text-3xl font-extrabold">Your matches</h1>
        <p className="mt-1 text-muted-foreground">Ranked by how well your plans fit.</p>
        <div className="mt-6 space-y-3">
          {matches.length === 0 && <p className="rounded-2xl bg-muted p-6 text-center text-muted-foreground">No close matches yet — try a different break or destination.</p>}
          {matches.map((m) => (
            <button key={m.profile.id} disabled={busy} onClick={() => openMatch(m.profile.id)} className="w-full rounded-2xl bg-card p-4 text-left shadow-card transition active:scale-[0.99] disabled:opacity-60">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary font-display text-lg font-bold text-primary">{m.profile.first_name[0]}</div>
                <div className="flex-1">
                  <div className="text-lg font-bold">{m.profile.first_name}</div>
                  <div className="text-sm text-muted-foreground">{m.profile.msba_year} · {m.profile.destinations[0]}</div>
                </div>
                <div className="text-right"><div className="font-display text-2xl font-extrabold text-primary">{m.score}%</div><div className="text-xs text-muted-foreground">match</div></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {m.reasons.map((r, i) => <Chip key={r} tone={i === 0 ? "gold" : "muted"}>{r}</Chip>)}
              </div>
            </button>
          ))}
        </div>
        {busy && <p className="mt-4 text-center text-sm font-semibold text-primary">Merging your plans…</p>}
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        <GhostButton className="mt-6" onClick={() => setStep(1)}>Change my answers</GhostButton>
      </Screen>
    );
  }

  if (step === "merge" && proposal) {
    return (
      <MergeScreen
        proposal={proposal}
        busy={busy}
        err={err}
        onBack={() => setStep("matches")}
        onAccept={() => run(async () => { await decideFn({ data: { proposalId: proposal.proposalId, status: "accepted" } }); navigate({ to: "/trip/$id", params: { id: proposal.proposalId } }); })}
        onPass={() => run(async () => { await decideFn({ data: { proposalId: proposal.proposalId, status: "passed" } }); setMatches(matches.filter((m) => m.profile.id !== proposal.them.id)); setStep("matches"); })}
        onCounter={(o) => openMatch(proposal.them.id, o)}
      />
    );
  }
  return null;
}

function MergeScreen({ proposal, busy, err, onBack, onAccept, onPass, onCounter }: {
  proposal: Proposal; busy: boolean; err: string | null; onBack: () => void; onAccept: () => void; onPass: () => void;
  onCounter: (o: { destination: string; start_date: string; end_date: string }) => void;
}) {
  const { me, them, merged } = proposal;
  const [countering, setCountering] = useState(false);
  const [c, setC] = useState({ destination: merged.destination, start_date: merged.start_date, end_date: merged.end_date });
  useEffect(() => { setCountering(false); setC({ destination: merged.destination, start_date: merged.start_date, end_date: merged.end_date }); }, [merged]);

  const PlanCard = ({ who, p }: { who: string; p: TripProfile }) => (
    <div className="rounded-2xl border-2 border-border bg-card p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{who}</div>
      <div className="mt-1 font-bold leading-tight">{p.destinations[0]}</div>
      <div className="text-sm text-muted-foreground">{range(p.start_date, p.end_date)}</div>
    </div>
  );

  return (
    <Screen step={`with ${them.first_name}`}>
      <button onClick={onBack} className="mb-3 self-start text-sm font-semibold text-muted-foreground">← Matches</button>
      <h1 className="text-2xl font-extrabold">Your merged plan</h1>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <PlanCard who="You" p={me} />
        <PlanCard who={them.first_name} p={them} />
      </div>
      <div className="mt-4 rounded-2xl bg-primary p-5 text-primary-foreground shadow-card">
        <div className="text-xs font-semibold uppercase tracking-widest opacity-80">Proposed {proposal.source === "ai" ? "· AI" : ""}</div>
        <div className="mt-1 font-display text-2xl font-extrabold">{merged.destination}</div>
        <div className="opacity-90">{range(merged.start_date, merged.end_date)}</div>
        <p className="mt-2 text-sm opacity-90">{merged.summary}</p>
      </div>
      <div className="mt-4 space-y-2">
        {merged.changes.length === 0 && <p className="text-sm text-muted-foreground">No changes needed — your plans already line up.</p>}
        {merged.changes.map((ch, i) => (
          <div key={i} className="rounded-2xl bg-secondary p-3">
            <div className="text-sm font-bold">{ch.field}: <span className="font-normal text-muted-foreground line-through">{ch.from}</span> → {ch.to}</div>
            <div className="text-sm text-muted-foreground">{ch.reason}</div>
          </div>
        ))}
      </div>

      {countering ? (
        <div className="mt-6 space-y-3 rounded-2xl border-2 border-accent bg-card p-4">
          <div className="font-bold">Counter-propose</div>
          <input value={c.destination} onChange={(e) => setC({ ...c, destination: e.target.value })} list="counter-dests" className="h-12 w-full rounded-xl border-2 border-border px-3" />
          <datalist id="counter-dests">{DESTINATIONS[me.break_id].map((x) => <option key={x.name} value={x.name} />)}</datalist>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={c.start_date} onChange={(e) => setC({ ...c, start_date: e.target.value })} className="h-12 rounded-xl border-2 border-border px-2" />
            <input type="date" value={c.end_date} onChange={(e) => setC({ ...c, end_date: e.target.value })} className="h-12 rounded-xl border-2 border-border px-2" />
          </div>
          <PrimaryButton disabled={busy || !c.destination.trim() || c.end_date < c.start_date} onClick={() => onCounter(c)}>{busy ? "Re-proposing…" : "Re-propose"}</PrimaryButton>
          <button className="w-full text-sm font-semibold text-muted-foreground" onClick={() => setCountering(false)}>Cancel</button>
        </div>
      ) : (
        <div className="mt-auto space-y-3 pt-8">
          <PrimaryButton disabled={busy} onClick={onAccept}>{busy ? "Saving…" : "Accept plan"}</PrimaryButton>
          <div className="grid grid-cols-2 gap-3">
            <GhostButton disabled={busy} onClick={() => setCountering(true)}>Counter</GhostButton>
            <GhostButton disabled={busy} onClick={onPass}>Pass</GhostButton>
          </div>
        </div>
      )}
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
    </Screen>
  );
}
