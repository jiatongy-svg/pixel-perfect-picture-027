// ============================================================================
// matching.ts — deterministic matching (no AI, no randomness).
//
// Same inputs always produce the same matches in the same order.
//
//   scorePair()      -> is a pair eligible, what's their 0–100 score, and why
//   findPairMatches  -> the signed-in user's top pair matches
//   findGroupMatches -> the signed-in user's top 3–4 person groups
// ============================================================================
import { findDestination, vibeLabel } from "./catalog";
import { MAX_GROUP_SIZE, MAX_RESULTS, MIN_GROUP_SIZE, MIN_MATCH_SCORE, WEIGHTS } from "./constants";
import { formatRange } from "./dates";
import { acceptedDestinations, budgetFit, dateFit, destinationFit, jaccard } from "./feasibility";
import type { Person } from "./types";

export type Blocker = "dates" | "destination" | "budget" | "score";

export type PairResult = {
  eligible: boolean;
  blockers: Blocker[];
  score: number;
  parts: { dates: number; destination: number; budget: number; vibes: number };
  reasons: string[];
};

// Stable id for a set of people: sorted ids joined by commas.
// The database uses the same format for proposals.member_key and passes.
export const memberKey = (ids: string[]) => [...ids].sort().join(",");

const placeName = (id: string | null) => (id ? findDestination(id)?.name ?? id : "");
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// ---------------------------------------------------------------------------
// Pair score, written from `me`'s point of view (reasons say "you" and their name).
// ---------------------------------------------------------------------------
export function scorePair(me: Person, them: Person, today: string): PairResult {
  const plans = [me.plan, them.plan];

  // 1. Hard constraints
  const d = dateFit(plans, today);
  const dest = destinationFit(plans);
  const b = budgetFit(plans);
  const blockers: Blocker[] = [];
  if (!d.feasible) blockers.push("dates");
  if (!dest.feasible) blockers.push("destination");
  if (!b.feasible) blockers.push("budget");

  // 2. Weighted score, each part 0..1 times its weight
  const v = jaccard(me.plan.vibes, them.plan.vibes);
  const parts = {
    dates: WEIGHTS.dates * d.ratio,
    destination: WEIGHTS.destination * dest.ratio,
    budget: WEIGHTS.budget * b.ratio,
    vibes: WEIGHTS.vibes * v,
  };
  const score = blockers.length ? 0 : Math.round(parts.dates + parts.destination + parts.budget + parts.vibes);
  if (!blockers.length && score < MIN_MATCH_SCORE) blockers.push("score");

  // 3. Reasons — only ever built from the actual plan data above.
  const reasons: string[] = [];
  if (!blockers.includes("dates") && !blockers.includes("destination")) {
    const mine = acceptedDestinations(me.plan).get(dest.best!);
    const theirs = acceptedDestinations(them.plan).get(dest.best!);
    const where = placeName(dest.best);
    const when = formatRange(d.overlap!);
    if (mine?.kind === "listed" && theirs?.kind === "listed") reasons.push(`You both want ${where} and overlap ${when}`);
    else {
      if (mine?.kind === "listed") reasons.push(`${where} is on your list and works for ${them.name}`);
      else if (theirs?.kind === "listed") reasons.push(`${them.name} wants ${where}, which fits your plan`);
      else reasons.push(`You're both flexible on destination — ${where} fits you both`);
      reasons.push(`You can both travel ${when} (a ${d.days}-day trip fits)`);
    }
  }
  if (b.feasible) reasons.push(`Budgets overlap at ${money(b.low)}–${money(b.high)}`);
  const sharedVibes = me.plan.vibes.filter((x) => them.plan.vibes.includes(x));
  if (sharedVibes.length) reasons.push(`You share: ${sharedVibes.map(vibeLabel).join(", ")}`);
  if (them.plan.bringing_car && !me.plan.bringing_car)
    reasons.push(`${them.name} can bring a car${them.plan.seats_offered ? ` with ${them.plan.seats_offered} open ${them.plan.seats_offered === 1 ? "seat" : "seats"}` : ""}`);

  return { eligible: blockers.length === 0, blockers, score, parts, reasons: reasons.slice(0, 4) };
}

export type PairMatch = { person: Person; score: number; reasons: string[] };

export type MatchSummary = {
  pairs: PairMatch[];
  // How many classmates were ruled out by each reason — for the "no matches" empty state.
  blockedBy: Record<Blocker, number>;
  considered: number;
};

// Top pair matches for `me` among `others` (already filtered to completed
// profiles with a plan; `passedIds` are people `me` has passed on).
export function findPairMatches(me: Person, others: Person[], passedIds: Set<string>, today: string): MatchSummary {
  const blockedBy: Record<Blocker, number> = { dates: 0, destination: 0, budget: 0, score: 0 };
  const pairs: PairMatch[] = [];
  const pool = others.filter((o) => o.id !== me.id && !passedIds.has(o.id));
  for (const o of pool) {
    const r = scorePair(me, o, today);
    if (r.eligible) pairs.push({ person: o, score: r.score, reasons: r.reasons });
    else for (const bl of r.blockers) blockedBy[bl]++;
  }
  // Highest score first; ties broken by user id so the order never changes randomly.
  pairs.sort((a, b) => b.score - a.score || (a.person.id < b.person.id ? -1 : 1));
  return { pairs: pairs.slice(0, MAX_RESULTS), blockedBy, considered: pool.length };
}

// ---------------------------------------------------------------------------
// Groups of 3–4 (including `me`)
// ---------------------------------------------------------------------------
export type GroupMatch = {
  members: Person[]; // the OTHER members (not including me)
  key: string; // memberKey of everyone including me
  score: number; // mean of all pair scores
  weakestPair: number;
  reasons: string[];
};

// All ways to choose k items from a list (small lists only: 5 classmates -> at most 10 combos).
function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

const countWord = (n: number) => ["", "one", "two", "three", "four", "five", "six"][n] ?? String(n);

export function scoreGroup(group: Person[], today: string): { eligible: boolean; score: number; weakest: number; reasons: string[] } {
  const fail = { eligible: false, score: 0, weakest: 0, reasons: [] };

  // Every pair must be eligible on its own and score at least MIN_MATCH_SCORE.
  const pairScores: number[] = [];
  for (let i = 0; i < group.length; i++)
    for (let j = i + 1; j < group.length; j++) {
      const r = scorePair(group[i], group[j], today);
      if (!r.eligible) return fail;
      pairScores.push(r.score);
    }

  // Pairs can each be fine in different ways, so check the whole group too.
  const plans = group.map((p) => p.plan);
  const d = dateFit(plans, today);
  const dest = destinationFit(plans);
  const b = budgetFit(plans);
  if (!d.feasible || !dest.feasible || !b.feasible) return fail;

  const score = Math.round(pairScores.reduce((s, x) => s + x, 0) / pairScores.length);
  const weakest = Math.min(...pairScores);
  const all = `All ${countWord(group.length)} of you`;
  const reasons: string[] = [];
  reasons.push(`${all} can travel ${formatRange(d.trip!)}`);

  const where = placeName(dest.best);
  const listedByAll = group.every((p) => p.plan.destinations.includes(dest.best!));
  reasons.push(listedByAll ? `Everyone listed ${where}` : `${where} works for everyone`);
  reasons.push(`All ${countWord(group.length)} budgets overlap between $${b.low} and $${b.high}`);

  // Vibes: shared by everyone, or by most — with an honest tradeoff if someone differs.
  const counts = new Map<string, number>();
  for (const p of group) for (const v of p.plan.vibes) counts.set(v, (counts.get(v) ?? 0) + 1);
  const everyone = [...counts].filter(([, c]) => c === group.length).map(([v]) => vibeLabel(v));
  const most = [...counts].filter(([, c]) => c >= 2 && c < group.length).map(([v]) => v);
  if (everyone.length) reasons.push(`Everyone's into ${listWords(everyone)}`);
  else if (most.length) {
    const top = most.slice(0, 2);
    const sharing = group.filter((p) => top.some((v) => p.plan.vibes.includes(v as never)));
    const outsiders = group.filter((p) => !sharing.includes(p));
    let text = `${countWord(sharing.length)[0].toUpperCase()}${countWord(sharing.length).slice(1)} of you share ${listWords(top.map(vibeLabel))}`;
    if (outsiders.length === 1) {
      const o = outsiders[0];
      text += o.plan.vibes.length ? `; ${o.name} prefers ${listWords(o.plan.vibes.map(vibeLabel))}` : "";
    }
    reasons.push(text);
  }

  // Tradeoff: shorter trip than someone hoped for.
  const shortchanged = group.filter((p) => p.plan.trip_length_max > d.days && p.plan.timing_mode === "break" && p.plan.date_mode !== "fixed");
  if (shortchanged.length === 1)
    reasons.push(`Tradeoff: ${d.days} days is shorter than the ${shortchanged[0].plan.trip_length_max} ${shortchanged[0].name} hoped for`);

  return { eligible: true, score, weakest, reasons };
}

// passedKeys: group keys the user passed on. passedIds: people the user passed on
// (passing on a person also hides groups that include them).
export function findGroupMatches(me: Person, others: Person[], passedIds: Set<string>, passedKeys: Set<string>, today: string): GroupMatch[] {
  const pool = others.filter((o) => o.id !== me.id && !passedIds.has(o.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const out: GroupMatch[] = [];
  for (let size = MIN_GROUP_SIZE; size <= MAX_GROUP_SIZE; size++) {
    for (const combo of combinations(pool, size - 1)) {
      const key = memberKey([me.id, ...combo.map((p) => p.id)]);
      if (passedKeys.has(key)) continue;
      const r = scoreGroup([me, ...combo], today);
      if (r.eligible) out.push({ members: combo, key, score: r.score, weakestPair: r.weakest, reasons: r.reasons });
    }
  }
  // Highest group score, then the strongest weakest pair, then sorted ids.
  out.sort((a, b) => b.score - a.score || b.weakestPair - a.weakestPair || (a.key < b.key ? -1 : 1));
  return out.slice(0, MAX_RESULTS);
}
