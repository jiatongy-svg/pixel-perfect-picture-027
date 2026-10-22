// ============================================================================
// filters.ts — the filter bar on Explore and Matches.
// Filters live in the URL (?when=winter&vibe=food&max=600&q=tokyo), so a
// filtered view can be refreshed, bookmarked or shared.
// ============================================================================
import { BREAK_IDS, VIBE_IDS, type BreakId, type VibeId } from "./catalog";
import { placeLabel } from "./places";
import type { TripCategory } from "./matching";
import type { PublicPlan } from "./types";

export type Filters = {
  when: "all" | BreakId | "weekend";
  vibe: VibeId | "";
  max: number | null; // the most you'd spend per person
  q: string; // destination search
};

export const NO_FILTERS: Filters = { when: "all", vibe: "", max: null, q: "" };

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const when = one("when");
  const vibe = one("vibe");
  const max = Number(one("max"));
  return {
    when: (BREAK_IDS as string[]).includes(when) || when === "weekend" ? (when as Filters["when"]) : "all",
    vibe: (VIBE_IDS as string[]).includes(vibe) ? (vibe as VibeId) : "",
    max: Number.isInteger(max) && max > 0 && max <= 100_000 ? max : null,
    q: one("q").trim().slice(0, 60),
  };
}

export const hasFilters = (f: Filters) => f.when !== "all" || !!f.vibe || f.max !== null || !!f.q;

// The kind of trip a single plan is (for Explore): its break, or weekends.
export const planCategory = (plan: PublicPlan): TripCategory => (plan.timing_mode === "weekends" ? "weekend" : plan.break_id ?? "weekend");

// Does this plan pass the filters? `category` is the match's trip category
// on the Matches page, or the plan's own category on Explore.
export function passes(plan: PublicPlan, f: Filters, category: TripCategory): boolean {
  if (f.when !== "all" && category !== f.when) return false;
  if (f.vibe && !plan.vibes.includes(f.vibe)) return false;
  if (f.max !== null && plan.budget_min > f.max) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!plan.destinations.some((p) => placeLabel(p).toLowerCase().includes(q) || (p.country ?? "").toLowerCase().includes(q))) return false;
  }
  return true;
}
