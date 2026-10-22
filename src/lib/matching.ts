import { mbtiSimilarity } from "./personality";
import { BUDGETS, findDestination, type MergeChange, type MergedPlan, type Plan, type TripProfile } from "./trip-data";

const DAY = 86400000;
const toDate = (s: string) => new Date(s + "T00:00:00Z").getTime();
const fromDate = (t: number) => new Date(t).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((toDate(b) - toDate(a)) / DAY);

export function planOf(p: TripProfile): Plan {
  return { destination: p.destinations[0] ?? "", start_date: p.start_date, end_date: p.end_date };
}

export type Match = { profile: TripProfile; score: number; reasons: string[]; mbtiPercent: number | null };

export function scoreMatch(me: TripProfile, them: TripProfile): Match | null {
  if (me.break_id !== them.break_id || me.id === them.id) return null;
  let score = 0;
  const reasons: string[] = [];

  // 1. Vibe fit (always first chip)
  const shared = me.vibes.filter((v) => them.vibes.includes(v));
  if (shared.length) {
    score += 15 + 10 * Math.min(shared.length, 2);
    reasons.push(`Both want ${shared.map((v) => v.toLowerCase()).join(" + ")}`);
  } else {
    reasons.push(`Vibe mix: ${[...me.vibes, ...them.vibes].map((v) => v.toLowerCase()).join(" / ")}`);
  }

  // 2. Destination overlap
  const myTop = me.destinations[0]?.toLowerCase();
  const theirs = them.destinations.map((x) => x.toLowerCase());
  if (myTop && theirs[0] === myTop) {
    score += 35;
    reasons.push("Same destination");
  } else {
    const common = me.destinations.find((x) => theirs.includes(x.toLowerCase()));
    if (common) {
      score += 20;
      reasons.push(`Both considering ${common}`);
    }
  }

  // 3. Dates
  const diff = Math.abs(daysBetween(me.start_date, them.start_date));
  if (diff === 0) {
    score += 20;
    reasons.push("Same dates");
  } else if (diff <= 2) {
    score += 15;
    reasons.push("Dates within 2 days");
  } else if (diff <= 5) {
    score += 6;
  }

  // 4. Budget
  const bi = (b: string) => BUDGETS.findIndex((x) => x.id === b);
  const bd = Math.abs(bi(me.budget) - bi(them.budget));
  if (bd === 0) {
    score += 10;
    reasons.push("Same budget");
  } else if (bd === 1) score += 4;

  // 5. Car complement
  const dest = findDestination(me.break_id, me.destinations[0] ?? "");
  if (dest?.car && !me.gear.includes("car") && them.gear.includes("car")) {
    score += 5;
    reasons.push("They have a car");
  }

  if (reasons.length < 2) reasons.push(diff <= 5 ? `Dates ${diff} days apart` : "Same break");
  const mbtiPercent = mbtiSimilarity(me.mbti, them.mbti);
  // At most five bonus points, only when the travel preferences already qualify.
  const bonus = score >= 25 && mbtiPercent !== null ? mbtiPercent / 20 : 0;
  return { profile: them, score: Math.min(99, score + bonus), reasons: reasons.slice(0, 3), mbtiPercent };
}

export function rankMatches(me: TripProfile, pool: TripProfile[], limit = 5): Match[] {
  return pool
    .map((p) => scoreMatch(me, p))
    .filter((m): m is Match => !!m && m.score >= 25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Deterministic merge used when AI is unavailable. */
export function mergeRules(me: TripProfile, them: TripProfile, override?: Partial<Plan>): MergedPlan {
  const mine = { ...planOf(me), ...override };
  const theirs = planOf(them);
  const changes: MergeChange[] = [];

  let destination = mine.destination;
  if (!override?.destination && mine.destination.toLowerCase() !== theirs.destination.toLowerCase()) {
    const common = me.destinations.find((x) => them.destinations.some((y) => y.toLowerCase() === x.toLowerCase()));
    if (common) {
      destination = common;
      if (common !== mine.destination)
        changes.push({ field: "Destination", from: mine.destination, to: common, reason: `${common} is on both of your lists.` });
      else changes.push({ field: "Destination", from: theirs.destination, to: common, reason: `${them.first_name} also ranked ${common}.` });
    } else {
      changes.push({ field: "Destination", from: theirs.destination, to: destination, reason: `Kept your top pick; ${them.first_name}'s vibe fits it.` });
    }
  }

  let start = mine.start_date;
  let end = mine.end_date;
  if (!override?.start_date && (mine.start_date !== theirs.start_date || mine.end_date !== theirs.end_date)) {
    const s = Math.max(toDate(mine.start_date), toDate(theirs.start_date));
    const e = Math.min(toDate(mine.end_date), toDate(theirs.end_date));
    if (e >= s) {
      start = fromDate(s);
      end = fromDate(e);
      changes.push({ field: "Dates", from: `${mine.start_date} → ${mine.end_date}`, to: `${start} → ${end}`, reason: "Trimmed to the days you're both free." });
    } else {
      const len = Math.max(1, daysBetween(mine.start_date, mine.end_date));
      const mid = (toDate(mine.start_date) + toDate(theirs.start_date)) / 2;
      start = fromDate(Math.round(mid / DAY) * DAY);
      end = fromDate(toDate(start) + len * DAY);
      changes.push({ field: "Dates", from: `${mine.start_date} → ${mine.end_date}`, to: `${start} → ${end}`, reason: "Shifted to meet halfway between your two date ranges." });
    }
  }

  return {
    destination,
    start_date: start,
    end_date: end,
    changes,
    summary: changes.length ? `A compromise trip to ${destination} that works for both of you.` : `You already agree — ${destination} it is!`,
  };
}

export function buildItinerary(breakId: TripProfile["break_id"], plan: Plan, travelers: TripProfile[]) {
  const dest = findDestination(breakId, plan.destination);
  const n = Math.max(1, daysBetween(plan.start_date, plan.end_date) + 1);
  const acts = dest?.activities ?? ["Arrive & explore", "Local highlights", "Free day", "Head home"];
  const days = Array.from({ length: n }, (_, i) => ({
    date: fromDate(toDate(plan.start_date) + i * DAY),
    activity: acts[i % acts.length],
  }));
  const budgetMid = (b: string) => BUDGETS.find((x) => x.id === b)?.mid ?? 500;
  const perPerson = dest
    ? Math.round((dest.min + dest.max) / 2)
    : Math.round(travelers.reduce((s, t) => s + budgetMid(t.budget), 0) / travelers.length);
  const shared = Math.round(perPerson * 0.6 * travelers.length); // lodging + car/gas
  return {
    days,
    total: perPerson * travelers.length,
    sharedCosts: shared,
    perPerson,
    needsCar: !!dest?.car,
    driver: dest?.car ? travelers.find((t) => t.gear.includes("car"))?.first_name ?? null : null,
  };
}
