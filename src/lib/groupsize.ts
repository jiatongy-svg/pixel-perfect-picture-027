// ============================================================================
// groupsize.ts — "What group size do you prefer to travel in?"
//
// Options are tied to cars on purpose, so the numbers mean something:
//   2     — just two of us
//   3-4   — fits in one car
//   5-6   — usually two cars
//   any   — open to any size
// Each student sets a default for weekend trips and for long-break trips on
// their profile; a plan can override it. Strict = never show trips outside
// it; Flexible (default) = it only lowers the score.
// ============================================================================
import { GROUP_SIZE_NEAR_MISS } from "./constants";
import type { GroupPref, Person } from "./types";

export const GROUP_SIZES: { id: GroupPref; label: string; description: string }[] = [
  { id: "2", label: "2 people", description: "Just a travel buddy" },
  { id: "3-4", label: "3–4 people", description: "Fits in one car" },
  { id: "5-6", label: "5–6 people", description: "Usually two cars" },
  { id: "any", label: "Any size", description: "The more the merrier" },
];
export const GROUP_PREF_IDS = GROUP_SIZES.map((g) => g.id) as [GroupPref, ...GroupPref[]];

export type TripKind = "weekend" | "long";

const RANGE: Record<GroupPref, [number, number]> = { "2": [2, 2], "3-4": [3, 4], "5-6": [5, 6], any: [1, 99] };
export const groupRange = (p: GroupPref) => RANGE[p];

// A person's preference for this kind of trip: the plan's own choice, or the
// profile default for weekend / long trips.
export function preferenceFor(p: Person, kind: TripKind): { pref: GroupPref; strict: boolean } {
  const pref = p.plan.group_pref ?? (kind === "weekend" ? p.profile.group_pref_weekend : p.profile.group_pref_long) ?? "any";
  const strict = p.plan.group_strict ?? (kind === "weekend" ? p.profile.group_strict_weekend : p.profile.group_strict_long) ?? false;
  return { pref, strict };
}

// 1 inside the range; GROUP_SIZE_NEAR_MISS one person outside; 0 further out.
export function sizeCredit(size: number, pref: GroupPref): number {
  const [lo, hi] = RANGE[pref];
  if (size >= lo && size <= hi) return 1;
  const off = size < lo ? lo - size : size - hi;
  return off === 1 ? GROUP_SIZE_NEAR_MISS : 0;
}

export const fitsRange = (size: number, pref: GroupPref) => sizeCredit(size, pref) === 1;

export const prefLabel = (p: GroupPref) => GROUP_SIZES.find((g) => g.id === p)?.label ?? "Any size";
