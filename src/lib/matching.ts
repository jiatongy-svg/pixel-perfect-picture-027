// ============================================================================
// matching.ts — deterministic matching (no AI, no randomness).
//
// Same inputs always produce the same matches in the same order.
//
// One core function scores ANY potential trip — two people or a group — from
// everyone's plan AND profile:
//
//   hard rules  dates overlap, a destination everyone accepts, budgets overlap,
//               and nobody's STRICT group-size limit is broken
//   score       dates 45 + destination 20 + group size 15 + budget 10 + style 10
//               (weights live in constants.ts)
//
//   scoreTrip()          -> one potential trip (2–4 people)
//   scorePair()          -> me + one classmate (used by Discover and tests)
//   findPotentialTrips() -> the Match page: pairs and groups in ONE list
// ============================================================================
import { BREAKS, PACE, vibeLabel } from "./catalog";
import { MAX_GROUP_SIZE, MAX_RESULTS, MIN_GROUP_SIZE, MIN_MATCH_SCORE, STYLE_SPLIT, WEIGHTS } from "./constants";
import { formatRange, toDay } from "./dates";
import { acceptance, budgetFit, dateFit, destinationFit } from "./feasibility";
import { fitsRange, preferenceFor, prefLabel, sizeCredit, type TripKind } from "./groupsize";
import { placeLabel, resolveDestination, type Place } from "./places";
import type { DateRange, Person, PublicPlan } from "./types";

export type Blocker = "dates" | "destination" | "budget" | "groupSize" | "score";

// Which kind of trip a match is: inside one of the long breaks, or a weekend
// trip. Decided by the suggested shared dates.
export type TripCategory = "thanksgiving" | "winter" | "spring" | "weekend";
export const CATEGORY_LABEL: Record<TripCategory, string> = {
  thanksgiving: "Thanksgiving break",
  winter: "Winter break",
  spring: "Spring break",
  weekend: "Weekend trips",
};
export function tripCategory(trip: DateRange | null): TripCategory {
  if (!trip) return "weekend";
  const b = BREAKS.find((x) => toDay(trip.start) >= toDay(x.start) && toDay(trip.end) <= toDay(x.end));
  return b ? b.id : "weekend";
}
// Weekend vs long trip, for group-size preferences.
export function tripKind(trip: DateRange | null, plans: PublicPlan[]): TripKind {
  if (trip) return tripCategory(trip) === "weekend" ? "weekend" : "long";
  return plans.every((p) => p.timing_mode === "weekends") ? "weekend" : "long";
}

// Stable key for a set of ids (plans or people): sorted, joined by commas.
// The database uses the same format for plan keys, member keys and passes.
export const memberKey = (ids: string[]) => [...ids].sort().join(",");

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const countWord = (n: number) => ["", "one", "two", "three", "four", "five", "six"][n] ?? String(n);

// ---------------------------------------------------------------------------
// Style helpers (the 10 "style" points)
// ---------------------------------------------------------------------------
const vibesOf = (p: Person) => (p.plan.vibes.length ? p.plan.vibes : p.profile.vibes ?? []);

// Shared vibes / the smaller list, so picking many vibes is never a penalty.
function vibeOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  return a.filter((x) => b.includes(x)).length / Math.min(a.length, b.length);
}
const paceIndex = (p: Person) => PACE.findIndex((x) => x.id === p.profile.pace);
// Same pace = 1, neighbours (chill/balanced) = 0.5, opposite (chill/packed) = 0.
const paceMatch = (a: Person, b: Person) => [1, 0.5, 0][Math.abs(paceIndex(a) - paceIndex(b))] ?? 0.5;

// Can this group actually get there? Fly-to places: yes. Drive places: only
// if someone brings a car, or someone can drive a rental on this trip.
export function transportFor(people: Person[], place: Place | null): { ok: boolean; how: "car" | "rental" | "fly" | "none"; who: Person | null } {
  const dest = place ? resolveDestination(place) : null;
  if (!dest || dest.access === "fly") return { ok: true, how: "fly", who: null };
  const withCar = people.find((p) => p.plan.bringing_car);
  if (withCar) return { ok: true, how: "car", who: withCar };
  const renter = people.find((p) => p.plan.willing_to_drive && p.profile.can_rent);
  if (renter) return { ok: true, how: "rental", who: renter };
  if (dest.access === "either") return { ok: true, how: "fly", who: null };
  return { ok: false, how: "none", who: null };
}

// ---------------------------------------------------------------------------
// The core: score one potential trip. people[0] is the viewer (reasons say "you").
// ---------------------------------------------------------------------------
export type TripScore = {
  eligible: boolean;
  blockers: Blocker[];
  score: number; // 0 when a hard rule fails
  fit: number; // the same weighted score, ignoring hard rules (shown as "% fit")
  parts: { dates: number; destination: number; groupSize: number; budget: number; style: number };
  reasons: string[];
  hints: string[]; // what someone would need to adjust ("shift your dates a bit")
  trip: DateRange | null;
  place: Place | null;
  kind: TripKind;
  size: number;
};

export function scoreTrip(people: Person[], today: string, opts: { anonymous?: boolean } = {}): TripScore {
  const [me, ...others] = people;
  const plans = people.map((p) => p.plan);
  const size = people.length;
  const nameOf = (p: Person) => (opts.anonymous ? (size === 2 ? "this classmate" : "a classmate") : p.name);

  // 1. Hard rules
  const d = dateFit(plans, today);
  const dest = destinationFit(plans);
  const b = budgetFit(plans);
  const kind = tripKind(d.trip, plans);
  const prefs = people.map((p) => preferenceFor(p, kind));
  const blockers: Blocker[] = [];
  if (!d.feasible) blockers.push("dates");
  if (!dest.feasible) blockers.push("destination");
  if (!b.feasible) blockers.push("budget");
  if (prefs.some((x) => x.strict && !fitsRange(size, x.pref))) blockers.push("groupSize");

  // 2. Weighted parts, each 0..1 times its weight
  let vibeSum = 0, paceSum = 0, pairs = 0;
  for (let i = 0; i < size; i++)
    for (let j = i + 1; j < size; j++) {
      vibeSum += vibeOverlap(vibesOf(people[i]), vibesOf(people[j]));
      paceSum += paceMatch(people[i], people[j]);
      pairs++;
    }
  const transport = transportFor(people, dest.best);
  const style = STYLE_SPLIT.vibes * (vibeSum / pairs) + STYLE_SPLIT.pace * (paceSum / pairs) + STYLE_SPLIT.logistics * (transport.ok ? 1 : 0);
  const groupCredit = Math.min(...prefs.map((x) => sizeCredit(size, x.pref)));
  const parts = {
    dates: WEIGHTS.dates * d.ratio,
    destination: WEIGHTS.destination * dest.ratio,
    groupSize: WEIGHTS.groupSize * groupCredit,
    budget: WEIGHTS.budget * b.ratio,
    style: WEIGHTS.style * style,
  };
  const fit = Math.round(parts.dates + parts.destination + parts.groupSize + parts.budget + parts.style);
  const score = blockers.length ? 0 : fit;
  if (!blockers.length && score < MIN_MATCH_SCORE) blockers.push("score");

  // 3. Reasons and hints — only ever built from the actual data above.
  const reasons: string[] = [];
  const hints: string[] = [];
  if (d.feasible && dest.feasible) {
    const where = placeLabel(dest.best!);
    const when = formatRange(d.overlap!);
    if (size === 2) {
      const them = others[0];
      const mine = acceptance(me.plan, dest.best!);
      const theirs = acceptance(them.plan, dest.best!);
      if (mine?.kind === "listed" && theirs?.kind === "listed") reasons.push(`You both want ${where} and overlap ${when}`);
      else {
        if (mine?.kind === "listed") reasons.push(`${where} is on your list and works for ${nameOf(them)}`);
        else if (theirs?.kind === "listed") reasons.push(`${cap(nameOf(them))} wants ${where}, which fits your plan`);
        else reasons.push(`You're both flexible on destination — ${where} fits you both`);
        reasons.push(`You can both travel ${when} (a ${d.days}-day trip fits)`);
      }
    } else {
      reasons.push(`All ${countWord(size)} of you can travel ${formatRange(d.trip!)}`);
      const listedByAll = people.every((p) => acceptance(p.plan, dest.best!)?.kind === "listed");
      reasons.push(listedByAll ? `Everyone listed ${where}` : `${where} works for everyone`);
    }
    // Would anyone have to move their preferred dates?
    for (const p of people) {
      if (p.plan.timing_mode !== "break" || p.plan.date_mode === "anytime" || !p.plan.preferred_start || !p.plan.preferred_end) continue;
      if (p.plan.preferred_start === d.trip!.start && p.plan.preferred_end === d.trip!.end) continue;
      const theirs = formatRange({ start: p.plan.preferred_start, end: p.plan.preferred_end });
      hints.push(p === me
        ? `You'd need to adjust your dates a bit: ${formatRange(d.trip!)} instead of your ${theirs}`
        : `${cap(nameOf(p))} would need to adjust their dates a bit (they picked ${theirs})`);
    }
  }
  if (b.feasible) reasons.push(size === 2 ? `Budgets overlap at ${money(b.low)}–${money(b.high)}` : `All ${countWord(size)} budgets overlap between ${money(b.low)} and ${money(b.high)}`);
  const shared = vibesOf(me).filter((v) => others.every((o) => vibesOf(o).includes(v)));
  if (shared.length) reasons.push(size === 2 ? `You share: ${shared.map(vibeLabel).join(", ")}` : `Everyone's into ${listWords(shared.map(vibeLabel))}`);
  if (transport.how === "car" && transport.who !== me && size === 2)
    reasons.push(`${cap(nameOf(transport.who!))} can bring a car${transport.who!.plan.seats_offered ? ` with ${transport.who!.plan.seats_offered} open ${transport.who!.plan.seats_offered === 1 ? "seat" : "seats"}` : ""}`);
  if (transport.how === "rental") reasons.push(transport.who === me ? "You can drive a rental car" : `${cap(nameOf(transport.who!))} can drive a rental car`);
  if (!transport.ok) hints.push("Nobody can drive here yet — someone with a license would need to rent a car");
  const myPref = prefs[0];
  if (!fitsRange(size, myPref.pref)) hints.push(`A trip of ${size} is outside your preferred group size (${prefLabel(myPref.pref)})`);

  return { eligible: blockers.length === 0, blockers, score, fit, parts, reasons: reasons.slice(0, 4), hints, trip: d.trip, place: dest.best, kind, size };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Me + one classmate.
export const scorePair = (me: Person, them: Person, today: string, opts: { anonymous?: boolean } = {}) => scoreTrip([me, them], today, opts);
export type PairResult = TripScore;

// ---------------------------------------------------------------------------
// The Match page: every potential trip for every one of my plans, pairs and
// groups together in one list, best first.
// ---------------------------------------------------------------------------
export type PotentialTrip = TripScore & {
  key: string; // sorted plan ids of everyone, including my plan
  mine: Person; // which of my plans
  others: Person[];
  category: TripCategory;
  weakestPair: number;
};

// All ways to choose k items from a list.
function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

// `passed`: plan ids, trip keys (and old user ids) I passed on. Passing on a
// plan also hides groups that include it. My own other plans are skipped.
export function findPotentialTrips(mine: Person[], everyoneElse: Person[], passed: Set<string>, today: string) {
  const out: PotentialTrip[] = [];
  const blockedBy: Record<Blocker, number> = { dates: 0, destination: 0, budget: 0, groupSize: 0, score: 0 };
  for (const me of mine) {
    const pool = everyoneElse
      .filter((o) => o.id !== me.id && !passed.has(o.plan.id) && !passed.has(o.id))
      .sort((a, b) => (a.plan.id < b.plan.id ? -1 : 1));
    const pairScore = new Map<string, number>();
    // Pairs
    for (const o of pool) {
      const r = scoreTrip([me, o], today, { anonymous: true });
      pairScore.set(o.plan.id, r.fit);
      const key = memberKey([me.plan.id, o.plan.id]);
      if (passed.has(key)) continue;
      if (r.eligible) out.push({ ...r, key, mine: me, others: [o], category: tripCategory(r.trip), weakestPair: r.score });
      else for (const bl of r.blockers) blockedBy[bl]++;
    }
    // Groups of 3–4: only from classmates who already fit me on their own
    // (keeps this fast as more people join).
    const candidates = pool.filter((o) => (pairScore.get(o.plan.id) ?? 0) >= MIN_MATCH_SCORE);
    for (let n = MIN_GROUP_SIZE; n <= MAX_GROUP_SIZE; n++) {
      for (const combo of combinations(candidates, n - 1)) {
        if (new Set(combo.map((p) => p.id)).size !== combo.length) continue; // one plan per person
        const key = memberKey([me.plan.id, ...combo.map((p) => p.plan.id)]);
        if (passed.has(key)) continue;
        const r = scoreTrip([me, ...combo], today, { anonymous: true });
        if (!r.eligible) continue;
        // Every pair inside the group must also work on its own.
        const group = [me, ...combo];
        let weakest = Infinity;
        for (let i = 0; i < group.length; i++)
          for (let j = i + 1; j < group.length; j++) weakest = Math.min(weakest, scoreTrip([group[i], group[j]], today).fit);
        if (weakest < MIN_MATCH_SCORE) continue;
        out.push({ ...r, key, mine: me, others: combo, category: tripCategory(r.trip), weakestPair: weakest });
      }
    }
  }
  // Best first; ties: stronger weakest pair, then smaller trips, then key.
  out.sort((a, b) => b.score - a.score || b.weakestPair - a.weakestPair || a.size - b.size || (a.key < b.key ? -1 : 1));
  // The same set of classmates via different plans of mine: keep the best one.
  const seen = new Set<string>();
  const unique = out.filter((t) => {
    const k = memberKey(t.others.map((o) => o.plan.id));
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { trips: unique, blockedBy };
}

// Kept for the tests and simple callers: just the pairs for one of my plans.
export function findPairMatches(me: Person, others: Person[], passed: Set<string>, today: string, limit = MAX_RESULTS) {
  const { trips, blockedBy } = findPotentialTrips([me], others, passed, today);
  const pairs = trips.filter((t) => t.size === 2).map((t) => ({ ...t, person: t.others[0] }));
  return { pairs: pairs.slice(0, limit), blockedBy, considered: others.length };
}
export function findGroupMatches(me: Person, others: Person[], passed: Set<string>, today: string, limit = MAX_RESULTS) {
  return findPotentialTrips([me], others, passed, today).trips.filter((t) => t.size > 2).map((t) => ({ ...t, members: t.others })).slice(0, limit);
}
