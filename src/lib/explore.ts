// Scoring a classmate's plan against ALL of my plans, for the Explore pages.
import { scorePair, type Blocker, type PairResult } from "./matching";
import type { Person } from "./types";

export const WHY: Record<Blocker, string> = {
  dates: "your dates don't overlap.",
  destination: "none of your destinations work for it.",
  budget: "your budgets don't overlap.",
  groupSize: "the group size is outside someone's strict limit.",
  score: "it only partly lines up with your plan."
};

// Each of my plans vs. theirs (anonymous wording), best first: plans that line
// up beat ones that don't; then by score.
export function scoreAgainstMine(mine: Person[], them: Person, today: string): { me: Person; result: PairResult }[] {
  return mine
    .map((me) => ({ me, result: scorePair(me, them, today, { anonymous: true }) }))
    .sort((a, b) => Number(b.result.eligible) - Number(a.result.eligible) || (b.result.eligible ? b.result.score - a.result.score : b.result.fit - a.result.fit));
}

export const bestAgainstMine = (mine: Person[], them: Person, today: string) => scoreAgainstMine(mine, them, today)[0] ?? null;
