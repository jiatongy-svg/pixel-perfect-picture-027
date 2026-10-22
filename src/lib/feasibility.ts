// ============================================================================
// feasibility.ts — the "can these people actually travel together?" checks.
//
// Both the matcher (matching.ts) and the trip merger (merge.ts) use these, so
// a match card and the merged plan can never disagree about what's possible.
//
// Three hard checks, each works for 2, 3 or 4 people:
//   1. Dates       — is there a stretch of days everyone is free, long enough?
//   2. Destination — is there at least one place everyone would accept?
//   3. Budget      — do everyone's budget ranges overlap?
// ============================================================================
import { DESTINATIONS, findBreak, findDestination } from "./catalog";
import { DESTINATION_PARTIAL, MIN_BUDGET_OVERLAP, MIN_SHARED_DAYS } from "./constants";
import { addDays, daysInclusive, formatDate, formatRange, intersectLists, toDay } from "./dates";
import type { DateRange, Person, PublicPlan } from "./types";

// ---------------------------------------------------------------------------
// 1. DATES
// ---------------------------------------------------------------------------

// Step 1: turn a plan into the list of date windows the person is free.
//   - Long break, "any days"       -> the whole break
//   - Long break, exact dates      -> exactly those dates
//   - Long break, dates ± N days   -> those dates widened by N on each side
//   - Weekends                     -> one Fri–Sun window per picked weekend
// Windows that are already in the past are dropped (or trimmed to start today).
export function planWindows(plan: PublicPlan, today: string): DateRange[] {
  let windows: DateRange[] = [];
  if (plan.timing_mode === "weekends") {
    windows = plan.weekends.map((fri) => ({ start: fri, end: addDays(fri, 2) }));
  } else {
    const brk = findBreak(plan.break_id ?? "");
    if (!brk) return [];
    if (plan.date_mode === "fixed" && plan.preferred_start && plan.preferred_end) {
      windows = [{ start: plan.preferred_start, end: plan.preferred_end }];
    } else if (plan.date_mode === "flex" && plan.preferred_start && plan.preferred_end) {
      windows = [{ start: addDays(plan.preferred_start, -plan.flex_days), end: addDays(plan.preferred_end, plan.flex_days) }];
    } else {
      windows = [{ start: brk.start, end: brk.end }];
    }
  }
  const t = toDay(today);
  return windows
    .filter((w) => toDay(w.end) >= t)
    .map((w) => (toDay(w.start) < t ? { start: today, end: w.end } : w));
}

// Step 2: how long does this person want the trip to be? [min, max] days.
// Someone with exact (fixed) dates wants exactly that many days.
export function tripLength(plan: PublicPlan): [number, number] {
  if (plan.timing_mode === "break" && plan.date_mode === "fixed" && plan.preferred_start && plan.preferred_end) {
    const n = daysInclusive({ start: plan.preferred_start, end: plan.preferred_end });
    return [n, n];
  }
  const max = plan.timing_mode === "weekends" ? Math.min(plan.trip_length_max, 3) : plan.trip_length_max;
  return [Math.min(plan.trip_length_min, max), max];
}

export type DateFit = {
  feasible: boolean;
  overlap: DateRange | null; // the full stretch everyone is free (best one)
  trip: DateRange | null; // the suggested trip inside that stretch
  days: number; // length of the suggested trip
  wantedDays: number; // the shortest "max length" in the group (what the trip could ideally be)
  ratio: number; // days / wantedDays, between 0 and 1 — used for the score
};

// Step 3: find the best shared trip for a group of plans.
// "Best" = the longest trip everyone can do (capped by everyone's max length).
// Ties go to the window that starts earliest, so results are always the same.
export function dateFit(plans: PublicPlan[], today: string): DateFit {
  const none: DateFit = { feasible: false, overlap: null, trip: null, days: 0, wantedDays: 0, ratio: 0 };
  if (plans.length === 0) return none;

  // Overlap everyone's windows, one person at a time.
  let shared = planWindows(plans[0], today);
  for (const p of plans.slice(1)) shared = intersectLists(shared, planWindows(p, today));

  const lengths = plans.map(tripLength);
  const maxLen = Math.min(...lengths.map((l) => l[1]));
  const minLen = Math.min(...lengths.map((l) => l[0]));
  const required = Math.min(MIN_SHARED_DAYS, minLen);

  let best: { overlap: DateRange; days: number } | null = null;
  for (const w of shared) {
    const days = Math.min(daysInclusive(w), maxLen);
    if (!best || days > best.days || (days === best.days && w.start < best.overlap.start)) best = { overlap: w, days };
  }
  if (!best || best.days < required) return { ...none, wantedDays: maxLen };

  // Place the trip inside the overlap. If some people gave preferred dates,
  // slide the trip to stay as close to those as possible.
  const anchors = plans
    .filter((p) => p.timing_mode === "break" && p.date_mode !== "anytime" && p.preferred_start)
    .map((p) => toDay(p.preferred_start!));
  const first = toDay(best.overlap.start);
  const last = toDay(best.overlap.end) - best.days + 1;
  let startDay = first;
  let bestCost = Infinity;
  for (let s = first; s <= last; s++) {
    const cost = anchors.reduce((sum, a) => sum + Math.abs(s - a), 0);
    if (cost < bestCost) {
      bestCost = cost;
      startDay = s;
    }
  }
  const start = addDays(best.overlap.start, startDay - first);
  return {
    feasible: true,
    overlap: best.overlap,
    trip: { start, end: addDays(start, best.days - 1) },
    days: best.days,
    wantedDays: maxLen,
    ratio: Math.min(1, best.days / maxLen),
  };
}

// A short, human description of when someone can travel. Used in conflict messages.
export function describeTiming(plan: PublicPlan, today: string): string {
  if (plan.timing_mode === "weekends") {
    const upcoming = plan.weekends.filter((f) => toDay(addDays(f, 2)) >= toDay(today));
    if (upcoming.length === 0) return "only picked weekends that have passed";
    const shown = upcoming.slice(0, 3).map((f) => `the ${formatDate(f)} weekend`);
    return `free ${shown.join(", ")}${upcoming.length > 3 ? ` (+${upcoming.length - 3} more)` : ""}`;
  }
  const brk = findBreak(plan.break_id ?? "");
  if (plan.date_mode === "fixed" && plan.preferred_start && plan.preferred_end)
    return `fixed ${formatRange({ start: plan.preferred_start, end: plan.preferred_end })}`;
  if (plan.date_mode === "flex" && plan.preferred_start && plan.preferred_end)
    return `around ${formatRange({ start: plan.preferred_start, end: plan.preferred_end })} (±${plan.flex_days} days)`;
  return brk ? `free any days of ${brk.label} (${formatRange(brk)})` : "has no dates set";
}

// ---------------------------------------------------------------------------
// 2. DESTINATION
// ---------------------------------------------------------------------------

// How happy someone is with a destination:
//   listed  — it's on their list (rank 0 = their top pick)
//   nearby  — not on their list, but in the same region and they're "open to nearby"
//   open    — they said they're open to anywhere
export type Acceptance = { kind: "listed"; rank: number } | { kind: "nearby" } | { kind: "open" };

export function acceptedDestinations(plan: PublicPlan): Map<string, Acceptance> {
  const out = new Map<string, Acceptance>();
  plan.destinations.forEach((id, rank) => {
    if (findDestination(id)) out.set(id, { kind: "listed", rank });
  });
  if (plan.destination_flex === "fixed") return out;

  const regions = new Set(plan.destinations.map((id) => findDestination(id)?.region));
  for (const d of DESTINATIONS) {
    if (out.has(d.id)) continue;
    if (regions.has(d.region)) out.set(d.id, { kind: "nearby" });
    else if (plan.destination_flex === "open") out.set(d.id, { kind: "open" });
  }
  return out;
}

const credit = (a: Acceptance) => (a.kind === "listed" ? 1 : a.kind === "nearby" ? DESTINATION_PARTIAL.nearby : DESTINATION_PARTIAL.open);

export type DestinationFit = {
  feasible: boolean;
  common: string[]; // destination ids everyone accepts, catalog order
  ratio: number; // 0..1 — the best "weakest-person credit" over the common places
  best: string | null; // the place behind that ratio
};

// Destination check for a group: the places everyone accepts, and how good the
// best one is for the LEAST happy person (so nobody gets steamrolled).
export function destinationFit(plans: PublicPlan[]): DestinationFit {
  const maps = plans.map(acceptedDestinations);
  const common = DESTINATIONS.map((d) => d.id).filter((id) => maps.every((m) => m.has(id)));
  let best: string | null = null;
  let ratio = 0;
  for (const id of common) {
    const r = Math.min(...maps.map((m) => credit(m.get(id)!)));
    if (r > ratio) {
      ratio = r;
      best = id;
    }
  }
  return { feasible: common.length > 0, common, ratio, best };
}

export function describeDestinations(plan: PublicPlan): string {
  const names = plan.destinations.map((id) => findDestination(id)?.name ?? id);
  if (names.length === 0) return "is open to anywhere";
  const list = names.slice(0, 3).join(", ");
  if (plan.destination_flex === "fixed") return `only wants ${list}`;
  if (plan.destination_flex === "open_to_nearby") return `wants ${list} or somewhere nearby`;
  return `prefers ${list} but is open`;
}

// ---------------------------------------------------------------------------
// 3. BUDGET
// ---------------------------------------------------------------------------
export type BudgetFit = { feasible: boolean; low: number; high: number; ratio: number };

// Budgets are per person for the whole trip. The shared range is from the
// highest minimum to the lowest maximum. The score compares that overlap to
// the narrowest person's range (if the narrowest range fits entirely, that's 100%).
export function budgetFit(plans: PublicPlan[]): BudgetFit {
  const low = Math.max(...plans.map((p) => p.budget_min));
  const high = Math.min(...plans.map((p) => p.budget_max));
  const overlap = high - low;
  if (overlap < MIN_BUDGET_OVERLAP || high < low) return { feasible: false, low, high, ratio: 0 };
  const narrowest = Math.min(...plans.map((p) => p.budget_max - p.budget_min));
  return { feasible: true, low, high, ratio: narrowest === 0 ? 1 : Math.min(1, overlap / narrowest) };
}

// ---------------------------------------------------------------------------
// 4. VIBES (soft — never blocks a match)
// ---------------------------------------------------------------------------
// Jaccard similarity = shared tags / all tags either person picked.
export function jaccard(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const union = new Set([...A, ...B]);
  if (union.size === 0) return 0;
  let shared = 0;
  for (const x of A) if (B.has(x)) shared++;
  return shared / union.size;
}

// ---------------------------------------------------------------------------
// Explain why a group can't travel together (used by merge and empty states).
// Returns an empty list if everything is compatible.
// ---------------------------------------------------------------------------
export function explainConflicts(people: Person[], today: string): string[] {
  const plans = people.map((p) => p.plan);
  const out: string[] = [];
  if (!dateFit(plans, today).feasible) {
    out.push(`Dates cannot overlap: ${people.map((p) => `${p.name} is ${describeTiming(p.plan, today)}`).join("; ")}.`);
  }
  if (!destinationFit(plans).feasible) {
    out.push(`No destination works for everyone: ${people.map((p) => `${p.name} ${describeDestinations(p.plan)}`).join("; ")}.`);
  }
  const b = budgetFit(plans);
  if (!b.feasible) {
    out.push(`Budgets don't overlap: ${people.map((p) => `${p.name} $${p.plan.budget_min}–$${p.plan.budget_max}`).join(", ")}.`);
  }
  return out;
}
