// Short, human summaries of a plan or profile for cards ("Thanksgiving break · 3–4 days").
import { EXPERIENCE, PACE, findBreak } from "./catalog";
import { placeLabel, toPlaces } from "./places";
import { addDays, formatDate, formatRange, toDay } from "./dates";
import type { Person, PublicPlan } from "./types";

export function whenText(plan: PublicPlan, today: string): string {
  if (plan.timing_mode === "weekends") {
    const upcoming = plan.weekends.filter((f) => toDay(addDays(f, 2)) >= toDay(today));
    if (!upcoming.length) return "Weekends (all passed)";
    return upcoming.length === 1 ? `Weekend of ${formatDate(upcoming[0])}` : `${upcoming.length} weekends from ${formatDate(upcoming[0])}`;
  }
  const brk = findBreak(plan.break_id ?? "");
  const base = brk?.label ?? "A break";
  if (plan.date_mode === "fixed" && plan.preferred_start && plan.preferred_end) return `${formatRange({ start: plan.preferred_start, end: plan.preferred_end })} (fixed)`;
  if (plan.date_mode === "flex" && plan.preferred_start && plan.preferred_end)
    return `${formatRange({ start: plan.preferred_start, end: plan.preferred_end })} ±${plan.flex_days}d`;
  const len = plan.trip_length_min === plan.trip_length_max ? `${plan.trip_length_max}` : `${plan.trip_length_min}–${plan.trip_length_max}`;
  return `${base} · ${len} days`;
}

export function whereText(plan: PublicPlan): string {
  const places = toPlaces(plan.destinations); // older proposal snapshots store plain ids
  if (!places.length) return "Open to anywhere";
  const names = places.slice(0, 2).map(placeLabel);
  const more = places.length > 2 ? ` +${places.length - 2}` : "";
  const flex = plan.destination_flex === "fixed" ? "" : plan.destination_flex === "open" ? " (open)" : " or nearby";
  return `${names.join(", ")}${more}${flex}`;
}

export const budgetText = (plan: PublicPlan) => `$${plan.budget_min.toLocaleString()}–$${plan.budget_max.toLocaleString()}`;

export function styleText(p: Person): string {
  const exp = EXPERIENCE.find((x) => x.id === p.profile.travel_experience)?.label;
  const pace = PACE.find((x) => x.id === p.profile.pace)?.label;
  return [exp, pace && `${pace.toLowerCase()} pace`].filter(Boolean).join(" · ");
}
