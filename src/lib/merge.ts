// ============================================================================
// merge.ts — turn 2–4 travel plans into ONE suggested trip (rules only, no AI).
//
// Rules, in order:
//   1. Never break anyone's fixed dates or fixed destination.
//   2. Dates: the longest stretch everyone is free (see dateFit).
//   3. Destination: the place with the highest combined preference
//      (your #1 pick counts most), with a small bonus for matching vibes.
//   4. Transport from the cars people said they'd bring.
//   5. Gear from what people said they'd bring.
//   6. A generic day-by-day outline (a suggestion, not live venue data).
//   7. A cost estimate with clear assumptions.
// If no trip is possible, we say exactly which constraint conflicts.
// ============================================================================
import { equipmentLabel, type Destination } from "./catalog";
import { COSTS, SHARED_SPLIT_LABEL } from "./constants";
import { addDays, daysInclusive, formatRange, formatWeekday, intersect, toDay } from "./dates";
import { acceptance, budgetFit, candidatePlaces, dateFit, destinationFit, explainConflicts, planWindows, tripLength } from "./feasibility";
import { placeLabel, resolveDestination, type Place } from "./places";
import type { DateRange, Person } from "./types";

type Range = [number, number];

export type CostLine = { label: string; perPerson: Range; total: Range; note: string };
export type CostEstimate = {
  people: number;
  days: number;
  nights: number;
  shared: CostLine[];
  individual: CostLine[];
  perPersonTotal: Range;
  split: string;
  assumptions: string[];
  budgetNote: string | null;
};

export type MergedTrip = {
  feasible: true;
  destination: { id: string; name: string; place?: Place }; // place: for the photo and map link
  dates: DateRange;
  days: number;
  summary: string;
  decisions: string[]; // why each choice was made, in plain English
  transport: { mode: "drive" | "rental" | "fly"; text: string; drivers: string[] };
  gear: { item: string; label: string; bringers: string[] }[];
  missingGear: string[];
  outline: { day: number; date: string; title: string }[];
  costs: CostEstimate;
  source: "rules" | "ai";
  notice?: string; // shown when AI mode was on but we fell back to rules
};

export type MergeResult = MergedTrip | { feasible: false; conflicts: string[] };

// Optional overrides from a "counter" — the person asks for a different place or dates.
export type MergeOverrides = { destinationId?: string; start?: string; end?: string };

// ---------------------------------------------------------------------------
// Destination choice: highest combined preference, tie -> catalog order.
// ---------------------------------------------------------------------------
function preferencePoints(people: Person[], place: Place): number {
  const dest = resolveDestination(place);
  let points = 0;
  for (const p of people) {
    const a = acceptance(p.plan, place);
    if (!a) return -Infinity;
    points += a.kind === "listed" ? 10 - a.rank : a.kind === "nearby" ? 3 : 1;
    // Small bonus for each of this person's vibes the place is good for.
    points += 0.5 * p.plan.vibes.filter((v) => dest.vibes.includes(v)).length;
  }
  return points;
}

// "Sam's #1", "near Priya's picks", "Ana is open" — stored in the proposal, so
// it's written with names (every member reads the same text).
function rankLabel(p: Person, place: Place): string {
  const a = acceptance(p.plan, place);
  if (a?.kind === "listed") return `${p.name}'s #${a.rank + 1}`;
  if (a?.kind === "nearby") return `near ${p.name}'s picks`;
  return `${p.name} is open`;
}

// ---------------------------------------------------------------------------
// Main entry point.
// ---------------------------------------------------------------------------
export function mergePlans(people: Person[], today: string, overrides: MergeOverrides = {}): MergeResult {
  const plans = people.map((p) => p.plan);
  const conflicts = explainConflicts(people, today);
  if (conflicts.length) return { feasible: false, conflicts };

  const decisions: string[] = [];

  // ---- Dates ---------------------------------------------------------------
  const fit = dateFit(plans, today);
  let dates = fit.trip!;
  if (overrides.start && overrides.end) {
    const asked = { start: overrides.start, end: overrides.end };
    const bad = checkDatesForEveryone(people, asked, today);
    if (bad.length) return { feasible: false, conflicts: bad };
    dates = asked;
    decisions.push(`Dates ${formatRange(dates)} were requested in a counter and fit everyone's availability.`);
  } else {
    const fixed = people.filter((p) => p.plan.timing_mode === "break" && p.plan.date_mode === "fixed");
    const why = fixed.length
      ? `respects the fixed dates set by ${listNames(fixed.map((p) => p.name))}`
      : fit.overlap && daysInclusive(fit.overlap) > fit.days
        ? `the longest trip everyone wants is ${fit.days} days, placed in the ${formatRange(fit.overlap)} window everyone has free`
        : `the longest stretch everyone is free`;
    decisions.push(`Dates ${formatRange(dates)}: ${why}.`);
  }
  const days = daysInclusive(dates);

  // ---- Destination ---------------------------------------------------------
  const destFit = destinationFit(plans);
  let place: Place;
  if (overrides.destinationId) {
    const asked = candidatePlaces(plans).find((c) => c.key === overrides.destinationId);
    if (!asked || !destFit.common.some((c) => c.key === asked.key)) {
      const name = asked ? placeLabel(asked) : "That destination";
      const blockers = asked ? people.filter((p) => !acceptance(p.plan, asked)) : people;
      return { feasible: false, conflicts: [`${name} doesn't work for ${listNames(blockers.map((p) => p.name))} (outside their destination preferences).`] };
    }
    place = asked;
    decisions.push(`${placeLabel(place)} was requested in a counter and works for everyone.`);
  } else {
    // Highest combined preference; ties keep candidate order (listed places first).
    place = destFit.common.reduce((best, c) => (preferencePoints(people, c) > preferencePoints(people, best) ? c : best));
    decisions.push(`${placeLabel(place)}: ${people.map((p) => rankLabel(p, place)).join(", ")}.`);
  }
  const dest = { ...resolveDestination(place), name: placeLabel(place) };

  // ---- Transport -----------------------------------------------------------
  const transport = pickTransport(people, dest);
  // ---- Gear ----------------------------------------------------------------
  const gearMap = new Map<string, string[]>();
  for (const p of people) for (const g of p.plan.bringing_gear) gearMap.set(g, [...(gearMap.get(g) ?? []), p.name]);
  const gear = [...gearMap].map(([item, bringers]) => ({ item, label: equipmentLabel(item), bringers }));
  const missingGear = dest.gear.filter((g) => !gearMap.has(g)).map(equipmentLabel);

  // ---- Outline + costs -------------------------------------------------------
  const outline = buildOutline(dest, dates, transport.mode);
  const costs = estimateCosts(dest, people.length, days, transport, budgetFit(plans));

  return {
    feasible: true,
    destination: { id: dest.id, name: dest.name, place },
    dates,
    days,
    summary: `${days}-day trip to ${dest.name}, ${formatRange(dates)}`,
    decisions,
    transport,
    gear,
    missingGear,
    outline,
    costs,
    source: "rules",
  };
}

const listNames = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// Requested dates must sit inside one of each person's free windows and not be
// longer than anyone's maximum trip length. Returns problems, or [] if OK.
export function checkDatesForEveryone(people: Person[], asked: DateRange, today: string): string[] {
  if (toDay(asked.end) < toDay(asked.start)) return ["The end date is before the start date."];
  if (toDay(asked.start) < toDay(today)) return ["Those dates have already started or passed."];
  const days = daysInclusive(asked);
  const out: string[] = [];
  for (const p of people) {
    const fits = planWindows(p.plan, today).some((w) => intersect(w, asked)?.start === asked.start && intersect(w, asked)?.end === asked.end);
    if (!fits) out.push(`${formatRange(asked)} is outside ${p.name}'s availability.`);
    else if (days > tripLength(p.plan)[1]) out.push(`${days} days is longer than ${p.name}'s maximum of ${tripLength(p.plan)[1]}.`);
  }
  return out;
}

function pickTransport(people: Person[], dest: Destination): MergedTrip["transport"] {
  if (dest.access === "fly") return { mode: "fly", text: "Fly — everyone books their own flight.", drivers: [] };
  // Biggest cars first, then by name so it's stable.
  const cars = people.filter((p) => p.plan.bringing_car).sort((a, b) => b.plan.seats_offered - a.plan.seats_offered || a.name.localeCompare(b.name));
  const chosen: Person[] = [];
  let seats = 0;
  for (const c of cars) {
    if (seats >= people.length) break;
    chosen.push(c);
    seats += 1 + c.plan.seats_offered; // the driver plus their open seats
  }
  if (chosen.length && seats >= people.length) {
    const names = chosen.map((c) => `${c.name}'s car (${c.plan.seats_offered} open ${c.plan.seats_offered === 1 ? "seat" : "seats"})`);
    return { mode: "drive", text: `Drive in ${listNames(names)}. Gas split evenly.`, drivers: chosen.map((c) => c.name) };
  }
  if (dest.access === "either") return { mode: "fly", text: "Nobody listed enough car seats, so the estimate assumes flying.", drivers: [] };
  const partial = chosen.length ? ` ${listNames(chosen.map((c) => c.name))}'s car fits ${seats} of ${people.length}.` : "";
  return { mode: "rental", text: `Not enough car seats listed for this trip.${partial} The estimate includes one rental car.`, drivers: chosen.map((c) => c.name) };
}

function buildOutline(dest: Destination, dates: DateRange, mode: MergedTrip["transport"]["mode"]) {
  const days = daysInclusive(dates);
  const travel = mode === "fly" ? "Fly in" : "Drive up";
  const ideas = dest.ideas;
  return Array.from({ length: days }, (_, i) => {
    let title: string;
    if (days === 1) title = `Day trip: ${ideas[0]}`;
    else if (i === 0) title = `${travel} and settle in; ${ideas[0].toLowerCase()} if there's time`;
    else if (i === days - 1) title = `${ideas[i % ideas.length]}, then head home`;
    else title = ideas[i % ideas.length];
    return { day: i + 1, date: formatWeekday(addDays(dates.start, i)), title };
  });
}

// ---------------------------------------------------------------------------
// Cost estimate. Every number here is a rough range from constants.ts.
// ---------------------------------------------------------------------------
const mul = (r: readonly [number, number], k: number): Range => [Math.round(r[0] * k), Math.round(r[1] * k)];

export function estimateCosts(
  dest: Destination,
  people: number,
  days: number,
  transport: MergedTrip["transport"],
  budget: { low: number; high: number; feasible: boolean },
): CostEstimate {
  const nights = Math.max(0, days - 1);
  const shared: CostLine[] = [];
  const individual: CostLine[] = [];
  const assumptions: string[] = [];

  // Lodging: per person per night by the destination's tier, everyone shares.
  if (nights > 0) {
    const pp = mul(COSTS.lodgingPerPersonNight[dest.lodging], nights);
    shared.push({ label: "Lodging", perPerson: pp, total: mul(pp, people), note: `${nights} ${nights === 1 ? "night" : "nights"}, ${dest.lodging === "camp" ? "shared campsite" : "shared room or rental"}` });
    assumptions.push(`Lodging uses the "${dest.lodging}" tier: $${COSTS.lodgingPerPersonNight[dest.lodging][0]}–$${COSTS.lodgingPerPersonNight[dest.lodging][1]} per person per night.`);
  }

  // Car: gas for each car (round trip), plus a rental if nobody has a car.
  if (transport.mode !== "fly") {
    const cars = Math.max(1, transport.drivers.length + (transport.mode === "rental" ? 1 : 0));
    const miles = dest.milesFromLA * 2;
    let total = mul(COSTS.gasPerMile, miles * cars);
    let note = `Gas for ${cars} ${cars === 1 ? "car" : "cars"}, ~${miles} miles round trip from LA`;
    if (transport.mode === "rental") {
      total = [total[0] + COSTS.rentalPerDay[0] * days, total[1] + COSTS.rentalPerDay[1] * days];
      note += `, plus a ${days}-day rental`;
    }
    shared.push({ label: "Gas / car", perPerson: mul(total, 1 / people), total, note });
    assumptions.push(`Gas at $${COSTS.gasPerMile[0]}–$${COSTS.gasPerMile[1]} per mile per car.`);
  }

  const groceries = mul(COSTS.groceriesPerPersonDay, days);
  shared.push({ label: "Groceries & snacks", perPerson: groceries, total: mul(groceries, people), note: `${days} ${days === 1 ? "day" : "days"}` });

  individual.push({ label: "Food out", perPerson: mul(COSTS.foodOutPerPersonDay, days), total: mul(COSTS.foodOutPerPersonDay, days * people), note: `$${COSTS.foodOutPerPersonDay[0]}–$${COSTS.foodOutPerPersonDay[1]} a day` });
  individual.push({ label: "Activities & entry fees", perPerson: [...dest.activities], total: mul(dest.activities, people), note: "Park passes, tickets, rentals" });
  if (transport.mode === "fly" && dest.flight) {
    individual.push({ label: "Flights", perPerson: [...dest.flight], total: mul(dest.flight, people), note: "Round trip from LAX, booked individually" });
    assumptions.push("Flight ranges are broad ballparks; real fares change daily.");
  }

  const all = [...shared, ...individual];
  const perPersonTotal: Range = [all.reduce((s, l) => s + l.perPerson[0], 0), all.reduce((s, l) => s + l.perPerson[1], 0)];
  assumptions.push("All amounts are estimates, not live quotes.");

  let budgetNote: string | null = null;
  if (budget.feasible && perPersonTotal[0] > budget.high)
    budgetNote = `Even the low estimate ($${perPersonTotal[0]}) is above the budget everyone shares ($${budget.low}–$${budget.high}). Consider fewer nights or camping.`;
  else if (budget.feasible && perPersonTotal[1] > budget.high)
    budgetNote = `The high estimate ($${perPersonTotal[1]}) goes above the shared budget ceiling of $${budget.high}.`;

  return { people, days, nights, shared, individual, perPersonTotal, split: SHARED_SPLIT_LABEL, assumptions, budgetNote };
}
