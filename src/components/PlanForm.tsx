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
import { BREAKS, EQUIPMENT, VIBES, findBreak, type EquipmentId, type VibeId } from "@/lib/catalog";
import { NEARBY_KM } from "@/lib/constants";
import { toPlaces } from "@/lib/places";
import { DestinationPicker } from "@/components/DestinationPicker";
import { PLAN_LIMITS, TRIPS } from "@/lib/constants";
import { GROUP_SIZES } from "@/lib/groupsize";
import { addDays, formatRange } from "@/lib/dates";
import type { DestinationFlex, Plan, Profile } from "@/lib/types";
import { Button, Card, Chip, Field, Group, Notice, OptionCard, cx, inputBase, inputClass } from "@/components/ui";

type Draft = Omit<Plan, "id" | "user_id" | "updated_at" | "notes" | "status" | "searching_since"> & { notes: string };

const DEFAULT: Draft = {
  title: "", timing_mode: "break", break_id: null, date_mode: "anytime", preferred_start: null, preferred_end: null, flex_days: 2, weekends: [],
  trip_length_min: 3, trip_length_max: 4, destinations: [], destination_flex: "open_to_nearby", budget_min: 200, budget_max: 600,
  vibes: [], bringing_car: false, seats_offered: 0, bringing_gear: [], notes: "",
  willing_to_drive: false, group_pref: null, group_strict: null,
};

const FLEX: { id: DestinationFlex; title: string; description: string }[] = [
  { id: "fixed", title: "Only these", description: "I'll only go to places on my list" },
  { id: "open_to_nearby", title: "These or nearby", description: `Places within ${NEARBY_KM} km work too` },
  { id: "open", title: "Anywhere", description: "My list is a preference, not a rule" },
];

type Props = {
  initial: Plan | null;
  profile: Pick<Profile, "has_car" | "car_seats" | "equipment" | "has_license" | "can_rent" | "vibes" | "group_pref_weekend" | "group_pref_long">;
  fridays: string[]; // upcoming Fridays the student may pick
  next?: string; // where to go after saving (default: the My plans list)
};

// `initial` with an id = editing that plan; null = creating a new plan.
export function PlanForm({ initial, profile, fridays, next }: Props) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(() =>
    initial
      ? { ...DEFAULT, ...initial, destinations: toPlaces(initial.destinations), notes: initial.notes ?? "", flex_days: initial.flex_days || 2 }
      : { ...DEFAULT, vibes: profile.vibes ?? [] }, // new plans start with my usual vibes
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string; conflicts?: string[] } | null>(null);
  // "I'm going no matter what": publish to Discover when saving (new plans only).
  const [publish, setPublish] = useState<{ on: boolean; spots: number; deadline: string }>({ on: false, spots: 2, deadline: "" });
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const brk = findBreak(d.break_id ?? "");
  const noIdea = d.destinations.length === 0 && d.destination_flex === "open";
  const maxLen = d.timing_mode === "weekends" ? 3 : PLAN_LIMITS.maxTripDays;
  // Past weekends from an older plan stay visible so they can be removed.
  const fridayOptions = useMemo(() => [...new Set([...d.weekends, ...fridays])].sort(), [d.weekends, fridays]);
  // Picking a first place after "I'm open" switches back to "these or nearby".
  const setDestinations = (places: Draft["destinations"]) =>
    setD((x) => ({ ...x, destinations: places, destination_flex: x.destinations.length === 0 && places.length > 0 && x.destination_flex === "open" ? "open_to_nearby" : x.destination_flex }));

  function submit() {
    setResult(null);
    startTransition(async () => {
      const r = await savePlan(
        { ...d, trip_length_min: Math.min(d.trip_length_min, maxLen), trip_length_max: Math.min(d.trip_length_max, maxLen) },
        initial?.id,
        publish.on ? { spots: publish.spots, joinDeadline: publish.deadline || null } : undefined,
      );
      if (r && !r.ok) {
        setErrors(r.fields ?? {});
        setResult({ tone: "error", text: r.error, conflicts: r.conflicts });
        // Move keyboard/screen-reader users to the first problem.
        const first = Object.keys(r.fields ?? {})[0];
        if (first) document.getElementById(first)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      setErrors({});
      router.push(next ?? "/plans?saved=1");
      router.refresh();
    });
  }
  const err = (k: string) => errors[k] || undefined;

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      {/* 0. NAME ------------------------------------------------------------ */}
      <Card>
        <Field id="title" label="Plan name" optional hint="Only you see this. Leave it blank and we'll name it from the dates and place." error={err("title")}>
          <input id="title" className={inputClass} maxLength={PLAN_LIMITS.maxTitle} value={d.title} placeholder="Thanksgiving desert trip"
            onChange={(e) => set("title", e.target.value)} />
        </Field>
      </Card>

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
        <p className="mb-4 text-sm text-muted">Search any city or tap a popular pick, in order of preference (up to {PLAN_LIMITS.maxDestinations}). No plan yet? That&apos;s fine — say you&apos;re open.</p>
        <div className="flex flex-col gap-5">
          <Chip selected={noIdea} className="self-start" onClick={() => setD((x) => (noIdea ? { ...x, destination_flex: "open_to_nearby" } : { ...x, destinations: [], destination_flex: "open" }))}>
            {noIdea && <Check aria-hidden className="size-3.5" />} No destination yet — I'm open to anywhere
          </Chip>
          <Group id="destinations" legend="Destinations" error={err("destinations")}>
            <DestinationPicker value={d.destinations} onChange={setDestinations} max={PLAN_LIMITS.maxDestinations} />
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
        {profile.has_license && (
          <div className="mb-4">
            <Chip selected={d.willing_to_drive} onClick={() => set("willing_to_drive", !d.willing_to_drive)}>
              {profile.can_rent ? "I can drive or rent a car on this trip" : "I can share the driving on this trip"}
            </Chip>
          </div>
        )}
        {!profile.has_car && profile.equipment.length === 0 ? (
          <p className="text-sm text-muted">Nothing listed on your profile yet. That&apos;s completely fine.</p>
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

      {/* 6. GROUP SIZE ------------------------------------------------------ */}
      <Card>
        <h2 className="mb-1 text-lg font-semibold">Group size for this trip</h2>
        <p className="mb-4 text-sm text-muted">Your profile default is {GROUP_SIZES.find((g) => g.id === (d.timing_mode === "weekends" ? profile.group_pref_weekend : profile.group_pref_long))?.label.toLowerCase()} for {d.timing_mode === "weekends" ? "weekend trips" : "long breaks"}.</p>
        <div role="radiogroup" aria-label="Group size for this trip" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <OptionCard selected={d.group_pref === null} title="My default" description="From my profile" onSelect={() => setD((x) => ({ ...x, group_pref: null, group_strict: null }))} />
          {GROUP_SIZES.map((g) => <OptionCard key={g.id} selected={d.group_pref === g.id} title={g.label} description={g.description} onSelect={() => setD((x) => ({ ...x, group_pref: g.id, group_strict: x.group_strict ?? false }))} />)}
        </div>
        {d.group_pref !== null && d.group_pref !== "any" && (
          <div role="radiogroup" aria-label="How flexible" className="mt-3 grid grid-cols-2 gap-2 sm:w-96">
            <OptionCard selected={!d.group_strict} title="Flexible" description="Lowers the score" onSelect={() => set("group_strict", false)} />
            <OptionCard selected={!!d.group_strict} title="Strict" description="Hard limit" onSelect={() => set("group_strict", true)} />
          </div>
        )}
      </Card>

      {/* 7. GO NO MATTER WHAT (new plans) ------------------------------------ */}
      {!initial && (
        <Card>
          <Chip selected={publish.on} onClick={() => setPublish((x) => ({ ...x, on: !x.on }))}>
            {publish.on && <Check aria-hidden className="size-3.5" />} I&apos;m going no matter what — post it to Discover now
          </Chip>
          <p className="mt-2 text-sm text-muted">Skip matching: classmates can join your plan as it is until sign-ups close. Needs at least one destination.</p>
          {publish.on && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field id="publish-spots" label="Open spots" hint="How many people can join you?">
                <input id="publish-spots" type="number" min={1} max={TRIPS.maxExtraSpots} className={`${inputBase} w-28`} value={publish.spots} onChange={(e) => setPublish((x) => ({ ...x, spots: Number(e.target.value) || 1 }))} />
              </Field>
              <Field id="publish-deadline" label="Sign-ups close" optional hint="Default: 2 days before the trip">
                <input id="publish-deadline" type="date" className={inputClass} value={publish.deadline} onChange={(e) => setPublish((x) => ({ ...x, deadline: e.target.value }))} />
              </Field>
            </div>
          )}
        </Card>
      )}

      {/* 8. NOTES ----------------------------------------------------------- */}
      <Card>
        <Field id="notes" label="Private notes" optional hint="Only you can see these." error={err("notes")}>
          <textarea id="notes" rows={3} maxLength={PLAN_LIMITS.maxNotes} className={`${inputClass} h-auto py-2`} value={d.notes} onChange={(e) => set("notes", e.target.value)}
            placeholder="Back by Sunday night for a group project. Prefer not to drive at night." />
        </Field>
      </Card>

      {result && <Notice tone={result.tone} title={result.text}>{result.conflicts && <ul className="list-disc pl-4">{result.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" loading={pending} className="w-full sm:w-auto">{publish.on ? "Save and post to Discover" : next ? "Save plan and see matches" : initial ? "Save changes" : "Save plan"}</Button>
      </div>
    </form>
  );
}
