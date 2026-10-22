"use client";
// ============================================================================
// Travel plan form — your ONE current plan. Sections:
//   1. When   — one long break, or several weekends in the next ~3 months
//   2. Where  — ranked destinations (or "I'm open"), plus how flexible you are
//   3. Budget — per person, whole trip
//   4. Vibes  — each with a description and examples
//   5. Bring  — which of YOUR profile gear/car you'll bring on this trip
//   6. Notes  — private, only you see them
// ============================================================================
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Car, Check } from "lucide-react";
import { savePlan } from "@/app/actions";
import { BREAKS, DESTINATIONS, EQUIPMENT, REGIONS, VIBES, findBreak, type EquipmentId, type RegionId, type VibeId } from "@/lib/catalog";
import { PLAN_LIMITS } from "@/lib/constants";
import { addDays, formatRange } from "@/lib/dates";
import type { DestinationFlex, Plan, Profile } from "@/lib/types";
import { Button, Card, Chip, Field, Group, Notice, OptionCard, cx, inputBase, inputClass } from "@/components/ui";

type Draft = Omit<Plan, "user_id" | "updated_at" | "notes"> & { notes: string };

const DEFAULT: Draft = {
  timing_mode: "break", break_id: null, date_mode: "anytime", preferred_start: null, preferred_end: null, flex_days: 2, weekends: [],
  trip_length_min: 3, trip_length_max: 4, destinations: [], destination_flex: "open_to_nearby", budget_min: 200, budget_max: 600,
  vibes: [], bringing_car: false, seats_offered: 0, bringing_gear: [], notes: "",
};

const FLEX: { id: DestinationFlex; title: string; description: string }[] = [
  { id: "fixed", title: "Only these", description: "I'll only go to places on my list" },
  { id: "open_to_nearby", title: "These or nearby", description: "Similar places in the same region work too" },
  { id: "open", title: "Anywhere", description: "My list is a preference, not a rule" },
];

type Props = {
  initial: Plan | null;
  profile: Pick<Profile, "has_car" | "car_seats" | "equipment">;
  fridays: string[]; // upcoming Fridays the student may pick
  next?: string;
};

export function PlanForm({ initial, profile, fridays, next }: Props) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(() => (initial ? { ...DEFAULT, ...initial, notes: initial.notes ?? "", flex_days: initial.flex_days || 2 } : DEFAULT));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const brk = findBreak(d.break_id ?? "");
  const noIdea = d.destinations.length === 0 && d.destination_flex === "open";
  const maxLen = d.timing_mode === "weekends" ? 3 : PLAN_LIMITS.maxTripDays;
  // Past weekends from an older plan stay visible so they can be removed.
  const fridayOptions = useMemo(() => [...new Set([...d.weekends, ...fridays])].sort(), [d.weekends, fridays]);
  const byRegion = useMemo(() => {
    const m = new Map<RegionId, typeof DESTINATIONS[number][]>();
    for (const dest of DESTINATIONS) m.set(dest.region, [...(m.get(dest.region) ?? []), dest]);
    return [...m];
  }, []);

  function toggleDestination(id: string) {
    setD((x) => {
      if (x.destinations.includes(id)) return { ...x, destinations: x.destinations.filter((y) => y !== id) };
      if (x.destinations.length >= PLAN_LIMITS.maxDestinations) return x;
      return { ...x, destinations: [...x.destinations, id], destination_flex: x.destinations.length === 0 && x.destination_flex === "open" ? "open_to_nearby" : x.destination_flex };
    });
  }

  function submit() {
    setResult(null);
    startTransition(async () => {
      const r = await savePlan({
        ...d,
        trip_length_min: Math.min(d.trip_length_min, maxLen),
        trip_length_max: Math.min(d.trip_length_max, maxLen),
      });
      if (!r.ok) {
        setErrors(r.fields ?? {});
        setResult({ tone: "error", text: r.error });
        // Move keyboard/screen-reader users to the first problem.
        const first = Object.keys(r.fields ?? {})[0];
        if (first) document.getElementById(first)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      setErrors({});
      if (next) router.push(next);
      else {
        setResult({ tone: "success", text: "Plan saved. Matches now use your latest plan." });
        router.refresh();
      }
    });
  }
  const err = (k: string) => errors[k] || undefined;

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      {/* 1. WHEN ------------------------------------------------------------ */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold">When can you go?</h2>
        <div className="flex flex-col gap-5">
          <div role="radiogroup" aria-label="Trip timing" className="grid grid-cols-2 gap-2">
            <OptionCard selected={d.timing_mode === "break"} title="A long break" description="Thanksgiving, winter or spring" onSelect={() => set("timing_mode", "break")} />
            <OptionCard selected={d.timing_mode === "weekends"} title="Weekends" description="Pick any in the next 3 months" onSelect={() => setD((x) => ({ ...x, timing_mode: "weekends", trip_length_min: Math.min(x.trip_length_min, 2), trip_length_max: Math.min(x.trip_length_max, 3) }))} />
          </div>

          {d.timing_mode === "break" ? (
            <>
              <Group id="break_id" legend="Which break?" error={err("break_id")}>
                <div role="radiogroup" aria-label="Which break" className="grid gap-2 sm:grid-cols-3">
                  {BREAKS.map((b) => (
                    <OptionCard key={b.id} selected={d.break_id === b.id} title={b.label} description={formatRange(b)} onSelect={() => setD((x) => ({ ...x, break_id: b.id, preferred_start: null, preferred_end: null }))} />
                  ))}
                </div>
              </Group>
              {brk && (
                <Group id="date_mode" legend="How set are your dates?" error={err("date_mode")}>
                  <div role="radiogroup" aria-label="How set are your dates" className="grid gap-2 sm:grid-cols-3">
                    <OptionCard selected={d.date_mode === "anytime"} title="Any days" description="Anywhere in the break works" onSelect={() => set("date_mode", "anytime")} />
                    <OptionCard selected={d.date_mode === "fixed"} title="Exact dates" description="These days, no change" onSelect={() => set("date_mode", "fixed")} />
                    <OptionCard selected={d.date_mode === "flex"} title="Around these dates" description="Can shift a few days" onSelect={() => set("date_mode", "flex")} />
                  </div>
                </Group>
              )}
              {brk && d.date_mode !== "anytime" && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field id="preferred_start" label="Start" error={err("preferred_start")}>
                    <input id="preferred_start" type="date" className={inputClass} min={brk.start} max={brk.end} value={d.preferred_start ?? ""}
                      onChange={(e) => set("preferred_start", e.target.value || null)} aria-invalid={!!err("preferred_start")} />
                  </Field>
                  <Field id="preferred_end" label="End" error={err("preferred_end")}>
                    <input id="preferred_end" type="date" className={inputClass} min={d.preferred_start ?? brk.start} max={brk.end} value={d.preferred_end ?? ""}
                      onChange={(e) => set("preferred_end", e.target.value || null)} aria-invalid={!!err("preferred_end")} />
                  </Field>
                  {d.date_mode === "flex" && (
                    <Field id="flex_days" label="Can shift by">
                      <select id="flex_days" className={inputClass} value={d.flex_days} onChange={(e) => set("flex_days", Number(e.target.value))}>
                        {Array.from({ length: PLAN_LIMITS.maxFlexDays }, (_, i) => i + 1).map((n) => <option key={n} value={n}>± {n} {n === 1 ? "day" : "days"}</option>)}
                      </select>
                    </Field>
                  )}
                </div>
              )}
            </>
          ) : (
            <Group id="weekends" legend="Which weekends work?" hint={`Fri–Sun. Pick up to ${PLAN_LIMITS.maxWeekends}.`} error={err("weekends")}>
              <div className="flex flex-wrap gap-2">
                {fridayOptions.map((f) => {
                  const on = d.weekends.includes(f);
                  return (
                    <Chip key={f} selected={on} disabled={!on && d.weekends.length >= PLAN_LIMITS.maxWeekends}
                      onClick={() => set("weekends", on ? d.weekends.filter((x) => x !== f) : [...d.weekends, f])}>
                      {on && <Check aria-hidden className="size-3.5" />}{formatRange({ start: f, end: addDays(f, 2) })}
                    </Chip>
                  );
                })}
              </div>
            </Group>
          )}

          {!(d.timing_mode === "break" && d.date_mode === "fixed") && (
            <Group id="trip_length_max" legend="How long a trip?" error={err("trip_length_max") ?? err("trip_length_min")}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="sr-only" htmlFor="trip_length_min">Shortest</label>
                <select id="trip_length_min" className={`${inputBase} w-24`} value={Math.min(d.trip_length_min, maxLen)} onChange={(e) => set("trip_length_min", Number(e.target.value))}>
                  {Array.from({ length: maxLen }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span>to</span>
                <label className="sr-only" htmlFor="trip_length_max_input">Longest</label>
                <select id="trip_length_max_input" className={`${inputBase} w-24`} value={Math.min(d.trip_length_max, maxLen)} onChange={(e) => set("trip_length_max", Number(e.target.value))}>
                  {Array.from({ length: maxLen }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span>days</span>
              </div>
            </Group>
          )}
        </div>
      </Card>

      {/* 2. WHERE ----------------------------------------------------------- */}
      <Card>
        <h2 className="mb-1 text-lg font-semibold">Where?</h2>
        <p className="mb-4 text-sm text-muted">Tap in order of preference (up to {PLAN_LIMITS.maxDestinations}). No plan yet? That's fine — say you're open.</p>
        <div className="flex flex-col gap-5">
          <Chip selected={noIdea} className="self-start" onClick={() => setD((x) => (noIdea ? { ...x, destination_flex: "open_to_nearby" } : { ...x, destinations: [], destination_flex: "open" }))}>
            {noIdea && <Check aria-hidden className="size-3.5" />} No destination yet — I'm open to anywhere
          </Chip>
          <Group id="destinations" legend="Destinations" error={err("destinations")}>
            <div className="flex flex-col gap-4">
              {byRegion.map(([region, dests]) => (
                <div key={region} className="min-w-0">
                  <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{REGIONS[region]}</p>
                  <div className="flex flex-wrap gap-2">
                    {dests.map((dest) => {
                      const rank = d.destinations.indexOf(dest.id);
                      return (
                        <Chip key={dest.id} selected={rank >= 0} disabled={rank < 0 && d.destinations.length >= PLAN_LIMITS.maxDestinations} onClick={() => toggleDestination(dest.id)}
                          aria-label={rank >= 0 ? `${dest.name}, choice ${rank + 1}` : dest.name}>
                          {rank >= 0 && <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-full bg-accent text-[0.6875rem] font-bold text-on-accent">{rank + 1}</span>}
                          {dest.name}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Group>
          {d.destinations.length > 0 && (
            <Group legend="How flexible are you on the place?">
              <div role="radiogroup" aria-label="Destination flexibility" className="grid gap-2 sm:grid-cols-3">
                {FLEX.map((f) => <OptionCard key={f.id} selected={d.destination_flex === f.id} title={f.title} description={f.description} onSelect={() => set("destination_flex", f.id)} />)}
              </div>
            </Group>
          )}
        </div>
      </Card>

      {/* 3. BUDGET ---------------------------------------------------------- */}
      <Card>
        <h2 className="mb-1 text-lg font-semibold">Budget</h2>
        <p className="mb-4 text-sm text-muted">Per person for the whole trip — lodging, food, gas or flights, activities.</p>
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          {(["budget_min", "budget_max"] as const).map((k) => (
            <Field key={k} id={k} label={k === "budget_min" ? "From" : "Up to"} error={err(k)}>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">$</span>
                <input id={k} type="number" inputMode="numeric" min={0} max={PLAN_LIMITS.maxBudget} step={10} className={`${inputClass} pl-7`}
                  value={Number.isNaN(d[k]) ? "" : d[k]} onChange={(e) => set(k, e.target.value === "" ? NaN : Math.round(Number(e.target.value)))} aria-invalid={!!err(k)} />
              </div>
            </Field>
          ))}
        </div>
      </Card>

      {/* 4. VIBES ----------------------------------------------------------- */}
      <Card>
        <h2 className="mb-1 text-lg font-semibold">Trip vibe</h2>
        <p className="mb-4 text-sm text-muted">Pick all that fit this trip.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {VIBES.map((v) => {
            const on = d.vibes.includes(v.id);
            return (
              <button key={v.id} type="button" aria-pressed={on}
                onClick={() => set("vibes", on ? d.vibes.filter((x) => x !== v.id) : [...d.vibes, v.id as VibeId])}
                className={cx(
                  "flex min-w-0 items-start gap-3 rounded-md border p-3 text-left transition-colors duration-150 active:bg-surface-active",
                  on ? "border-accent bg-accent-subtle" : "border-border-interactive bg-surface-raised hover:bg-surface-hover",
                )}>
                <span aria-hidden className={cx("mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm border", on ? "border-accent bg-accent text-on-accent" : "border-border-interactive")}>
                  {on && <Check className="size-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className={cx("block text-sm font-semibold", on && "text-accent-text")}>{v.label}</span>
                  <span className="block text-sm text-text">{v.description}</span>
                  <span className="block text-xs text-muted">e.g. {v.examples}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 5. BRING ----------------------------------------------------------- */}
      <Card>
        <h2 className="mb-1 text-lg font-semibold">For this trip, I can bring</h2>
        <p className="mb-4 text-sm text-muted">From your profile. <Link href="/profile" className="font-medium text-accent-text underline-offset-4 hover:underline">Update what you own</Link></p>
        {!profile.has_car && profile.equipment.length === 0 ? (
          <p className="text-sm text-muted">Nothing listed on your profile yet. That's completely fine.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {profile.has_car && (
              <div className="flex flex-wrap items-center gap-3">
                <Chip selected={d.bringing_car} onClick={() => setD((x) => ({ ...x, bringing_car: !x.bringing_car, seats_offered: !x.bringing_car ? profile.car_seats : 0 }))}>
                  <Car aria-hidden className="size-4" /> My car
                </Chip>
                {d.bringing_car && (
                  <label className="flex items-center gap-2 text-sm">
                    Open seats
                    <select id="seats_offered" className={`${inputBase} w-20`} value={d.seats_offered} onChange={(e) => set("seats_offered", Number(e.target.value))}>
                      {Array.from({ length: profile.car_seats + 1 }, (_, i) => i).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                )}
              </div>
            )}
            {profile.equipment.length > 0 && (
              <div id="bringing_gear" className="flex flex-wrap gap-2">
                {EQUIPMENT.filter((e) => profile.equipment.includes(e.id)).map((e) => {
                  const on = d.bringing_gear.includes(e.id);
                  return <Chip key={e.id} selected={on} onClick={() => set("bringing_gear", on ? d.bringing_gear.filter((x) => x !== e.id) : [...d.bringing_gear, e.id as EquipmentId])}>{e.label}</Chip>;
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 6. NOTES ----------------------------------------------------------- */}
      <Card>
        <Field id="notes" label="Private notes" optional hint="Only you can see these." error={err("notes")}>
          <textarea id="notes" rows={3} maxLength={PLAN_LIMITS.maxNotes} className={`${inputClass} h-auto py-2`} value={d.notes} onChange={(e) => set("notes", e.target.value)}
            placeholder="Back by Sunday night for a group project. Prefer not to drive at night." />
        </Field>
      </Card>

      {result && <Notice tone={result.tone}>{result.text}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" loading={pending} className="w-full sm:w-auto">{next ? "Save plan and see matches" : "Save plan"}</Button>
      </div>
    </form>
  );
}
