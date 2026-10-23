import { describe, expect, it } from "vitest";
import { MIN_MATCH_SCORE } from "@/lib/constants";
import { dateFit, planWindows, budgetFit, destinationFit } from "@/lib/feasibility";
import { findGroupMatches, findPairMatches, findPotentialTrips, memberKey, scorePair } from "@/lib/matching";
import { upcomingFridays, formatRange } from "@/lib/dates";
import { person, TODAY } from "./helpers";

describe("dates", () => {
  it("lists upcoming Fridays only", () => {
    const fridays = upcomingFridays(TODAY, 30); // 2026-10-21 is a Wednesday
    expect(fridays[0]).toBe("2026-10-23");
    expect(fridays).toHaveLength(5);
  });
  it("formats ranges for people", () => {
    expect(formatRange({ start: "2026-11-21", end: "2026-11-24" })).toBe("Nov 21–24");
    expect(formatRange({ start: "2026-11-29", end: "2026-12-02" })).toBe("Nov 29 – Dec 2");
  });
  it("turns a weekend pick into a Fri–Sun window", () => {
    const p = person("a", "A", { timing_mode: "weekends", break_id: null, weekends: ["2026-11-06"] }).plan;
    expect(planWindows(p, TODAY)).toEqual([{ start: "2026-11-06", end: "2026-11-08" }]);
  });
  it("drops windows that are already over", () => {
    const p = person("a", "A", { timing_mode: "weekends", break_id: null, weekends: ["2026-10-02"] }).plan;
    expect(planWindows(p, TODAY)).toEqual([]);
  });
});

describe("hard constraints", () => {
  it("fixed dates that cannot overlap make a pair ineligible", () => {
    const sam = person("s", "Sam", { date_mode: "fixed", preferred_start: "2026-11-25", preferred_end: "2026-11-26" });
    const priya = person("p", "Priya", { date_mode: "fixed", preferred_start: "2026-11-28", preferred_end: "2026-11-29" });
    const r = scorePair(sam, priya, TODAY);
    expect(r.eligible).toBe(false);
    expect(r.blockers).toContain("dates");
  });
  it("respects the other person's flexibility around fixed dates", () => {
    const sam = person("s", "Sam", { date_mode: "fixed", preferred_start: "2026-11-26", preferred_end: "2026-11-28" });
    const priya = person("p", "Priya", { date_mode: "flex", preferred_start: "2026-11-28", preferred_end: "2026-11-29", flex_days: 2 });
    const fit = dateFit([sam.plan, priya.plan], TODAY);
    expect(fit.feasible).toBe(true);
    expect(fit.trip).toEqual({ start: "2026-11-26", end: "2026-11-28" }); // stays inside Sam's fixed dates
  });
  it("fixed destinations must be acceptable to the other person", () => {
    const a = person("a", "A", { destinations: ["zion-bryce"], destination_flex: "fixed" });
    const b = person("b", "B", { destinations: ["cabo"], destination_flex: "fixed" });
    expect(destinationFit([a.plan, b.plan]).feasible).toBe(false);
    expect(scorePair(a, b, TODAY).blockers).toContain("destination");
  });
  it("open-to-nearby accepts places in the same region", () => {
    const a = person("a", "A", { destinations: ["yosemite"], destination_flex: "fixed" });
    const b = person("b", "B", { destinations: ["mammoth"], destination_flex: "open_to_nearby" });
    const fit = destinationFit([a.plan, b.plan]);
    expect(fit.common.map((c) => c.key)).toEqual(["yosemite"]);
    expect(fit.ratio).toBeCloseTo(0.6);
  });
  it("budgets must overlap", () => {
    const a = person("a", "A", { budget_min: 100, budget_max: 200 });
    const b = person("b", "B", { budget_min: 250, budget_max: 600 });
    expect(budgetFit([a.plan, b.plan]).feasible).toBe(false);
    expect(budgetFit([a.plan, { ...b.plan, budget_min: 200 }]).feasible).toBe(true); // touching counts
  });
  it("students with no destination yet can still match", () => {
    const a = person("a", "A", { destinations: [], destination_flex: "open" });
    const b = person("b", "B", { destinations: ["joshua-tree"], destination_flex: "fixed" });
    const r = scorePair(a, b, TODAY);
    expect(r.eligible).toBe(true);
    expect(r.reasons.some((x) => x.includes("Joshua Tree"))).toBe(true);
  });
});

describe("pair scoring", () => {
  it("scores identical plans 100 (when someone can drive there) with at least two data-backed reasons", () => {
    const r = scorePair(person("a", "Ana"), person("b", "Ben", { bringing_car: true, seats_offered: 2 }), TODAY);
    expect(r.score).toBe(100);
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
    expect(r.reasons[0]).toBe("You both want Joshua Tree and overlap Nov 25–29");
    expect(r.reasons).toContain("Budgets overlap at $150–$400");
    expect(r.reasons).toContain("You share: outdoors, food");
  });
  it("uses the documented weights", () => {
    const a = person("a", "A", { vibes: ["outdoors"] });
    const b = person("b", "B", { vibes: ["food"], budget_min: 300, budget_max: 600 });
    const r = scorePair(a, b, TODAY);
    // dates 45 + destination 20 + group size 15 + budget 10 * (overlap 100 / narrowest 250)
    // + style 10 * (vibes 0 * 0.5 + same pace 1 * 0.25 + nobody can drive 0 * 0.25)
    expect(r.score).toBe(Math.round(45 + 20 + 15 + (10 * 100) / 250 + 10 * 0.25));
  });
  it("never invents a car reason", () => {
    const r = scorePair(person("a", "A"), person("b", "B"), TODAY);
    expect(r.reasons.join(" ")).not.toMatch(/car/);
    const withCar = scorePair(person("a", "A"), person("b", "Ben", { bringing_car: true, seats_offered: 3 }), TODAY);
    expect(withCar.reasons).toContain("Ben can bring a car with 3 open seats");
  });
});

describe("findPairMatches", () => {
  const me = person("m", "Me");
  it("excludes me, passed people, and ineligible plans; sorts by score then id", () => {
    const others = [
      me,
      person("c", "C"),
      person("b", "B"),
      person("x", "Passed"),
      person("z", "Far", { break_id: "spring" }),
      person("y", "Weak", { vibes: ["nightlife"], destinations: ["san-diego"], destination_flex: "open", budget_min: 395, budget_max: 2000 }),
    ];
    const r = findPairMatches(me, others, new Set(["x"]), TODAY);
    expect(r.pairs.map((p) => p.person.id).slice(0, 2)).toEqual(["b", "c"]); // tie -> id order
    expect(r.pairs.find((p) => p.person.id === "m")).toBeUndefined();
    expect(r.pairs.find((p) => p.person.id === "x")).toBeUndefined();
    expect(r.blockedBy.dates).toBe(1);
    expect(r.pairs.every((p) => p.score >= MIN_MATCH_SCORE)).toBe(true);
  });
  it("returns at most 5", () => {
    const many = Array.from({ length: 8 }, (_, i) => person(`p${i}`, `P${i}`));
    expect(findPairMatches(me, many, new Set(), TODAY).pairs).toHaveLength(5);
  });
});

describe("group matching", () => {
  const me = person("a", "Ana");
  it("finds a group when everyone is compatible, with reasons", () => {
    const groups = findGroupMatches(me, [person("b", "Ben"), person("c", "Cy")], new Set(), TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(memberKey(["plan-a", "plan-b", "plan-c"]));
    expect(groups[0].reasons).toContain("All three of you can travel Nov 25–28");
    expect(groups[0].reasons).toContain("Everyone listed Joshua Tree");
  });
  it("rejects groups where pairs are fine but the whole group has no shared window", () => {
    // A–B share Nov 25–26, B–C share Nov 28–29, A–C share... nothing in common for all three.
    const b = person("b", "Ben", { date_mode: "flex", preferred_start: "2026-11-25", preferred_end: "2026-11-29", flex_days: 0, trip_length_min: 2 });
    const a2 = person("a", "Ana", { date_mode: "fixed", preferred_start: "2026-11-25", preferred_end: "2026-11-26" });
    const c = person("c", "Cy", { date_mode: "fixed", preferred_start: "2026-11-28", preferred_end: "2026-11-29" });
    expect(scorePair(a2, b, TODAY).eligible).toBe(true);
    expect(scorePair(b, c, TODAY).eligible).toBe(true);
    expect(findGroupMatches(a2, [b, c], new Set(), TODAY)).toHaveLength(0);
  });
  it("hides a passed group and groups with a passed person", () => {
    const others = [person("b", "Ben"), person("c", "Cy")];
    expect(findGroupMatches(me, others, new Set([memberKey(["plan-a", "plan-b", "plan-c"])]), TODAY)).toHaveLength(0);
    expect(findGroupMatches(me, others, new Set(["plan-c"]), TODAY)).toHaveLength(0);
  });
  it("breaks ties by weakest pair, then ids", () => {
    const others = [person("b", "B"), person("c", "C"), person("d", "D")];
    const groups = findGroupMatches(me, others, new Set(), TODAY);
    // Same score: smaller trips first, then by key.
    expect(groups.map((g) => g.key)).toEqual(["plan-a,plan-b,plan-c", "plan-a,plan-b,plan-d", "plan-a,plan-c,plan-d", "plan-a,plan-b,plan-c,plan-d"]);
  });
});

describe("several plans per person", () => {
  const withPlan = (id: string, name: string, planId: string, over = {}) => {
    const p = person(id, name, over);
    return { ...p, plan: { ...p.plan, id: planId } };
  };
  it("matches each of my plans and lists each classmate plan once, against my best plan", () => {
    const mine = [withPlan("me", "Me", "m1"), withPlan("me", "Me", "m2", { break_id: "spring" })];
    const others = [withPlan("b", "Ben", "b1"), withPlan("b", "Ben", "b2", { break_id: "spring" }), withPlan("c", "Cy", "c1", { break_id: "winter" })];
    const r = findPotentialTrips(mine, others, new Set(), TODAY);
    expect(r.trips.filter((t) => t.size === 2).map((t) => `${t.mine.plan.id}->${t.others[0].plan.id}`).sort()).toEqual(["m1->b1", "m2->b2"]);
  });
  it("never puts two plans of the same person in one group", () => {
    const me = withPlan("me", "Me", "m1");
    const groups = findGroupMatches(me, [withPlan("b", "Ben", "b1"), withPlan("b", "Ben", "b2"), withPlan("c", "Cy", "c1")], new Set(), TODAY);
    expect(groups.every((g) => new Set(g.members.map((m) => m.id)).size === g.members.length)).toBe(true);
  });
  it("skips my own other plans and passed plans", () => {
    const mine = [withPlan("me", "Me", "m1"), withPlan("me", "Me", "m2")];
    const r = findPotentialTrips(mine, [withPlan("b", "Ben", "b1"), withPlan("c", "Cy", "c1")], new Set(["c1"]), TODAY);
    expect(r.trips.map((t) => t.others.map((o) => o.plan.id).join())).toEqual(["b1"]);
  });
  it("anonymous reasons never contain the classmate's name", () => {
    const me = person("a", "Ana", { destinations: ["joshua-tree"] });
    const them = person("b", "Jamie Sun", { destinations: ["palm-springs", "joshua-tree"], bringing_car: true, seats_offered: 2 });
    const r = scorePair(me, them, TODAY, { anonymous: true });
    expect(r.reasons.join(" ")).not.toContain("Jamie");
    expect(scorePair(me, them, TODAY).reasons.join(" ")).toContain("Jamie Sun");
  });
});

describe("group size, driving and date hints", () => {
  const withProfile = (p: ReturnType<typeof person>, profile: Partial<ReturnType<typeof person>["profile"]>) => ({ ...p, profile: { ...p.profile, ...profile } });

  it("a size outside my preferred range costs a real chunk of the score (80% -> about 70%)", () => {
    const fits = scorePair(withProfile(person("a", "A"), { group_pref_long: "2" }), person("b", "B"), TODAY);
    const misses = scorePair(withProfile(person("a", "A"), { group_pref_long: "3-4" }), person("b", "B"), TODAY);
    expect(fits.parts.groupSize).toBe(15);
    expect(misses.parts.groupSize).toBeCloseTo(6); // one person off: keeps 40% of 15
    expect(fits.score - misses.score).toBe(9);
    expect(misses.hints.join(" ")).toContain("outside your preferred group size");
  });

  it("'Any size' and a wide range get full points", () => {
    expect(scorePair(person("a", "A"), person("b", "B"), TODAY).parts.groupSize).toBe(15);
  });

  it("Strict excludes trips outside my range; Flexible only lowers the score", () => {
    const strict = scorePair(withProfile(person("a", "A"), { group_pref_long: "3-4", group_strict_long: true }), person("b", "B"), TODAY);
    expect(strict.eligible).toBe(false);
    expect(strict.blockers).toContain("groupSize");
    const flexible = scorePair(withProfile(person("a", "A"), { group_pref_long: "3-4", group_strict_long: false }), person("b", "B"), TODAY);
    expect(flexible.eligible).toBe(true);
  });

  it("weekend and long-trip preferences are separate", () => {
    const me = withProfile(person("a", "A", { timing_mode: "weekends", break_id: null, weekends: ["2026-11-06"], trip_length_max: 3 }), { group_pref_weekend: "2", group_pref_long: "5-6" });
    const them = person("b", "B", { timing_mode: "weekends", break_id: null, weekends: ["2026-11-06"], trip_length_max: 3 });
    expect(scorePair(me, them, TODAY).parts.groupSize).toBe(15); // weekend pref "2" fits a pair
  });

  it("a plan's own group size overrides the profile default", () => {
    const me = withProfile(person("a", "A", { group_pref: "2", group_strict: true }), { group_pref_long: "5-6", group_strict_long: true });
    expect(scorePair(me, person("b", "B"), TODAY).eligible).toBe(true);
  });

  it("someone who can rent a car makes a drive-only trip work", () => {
    const noDriver = scorePair(person("a", "A"), person("b", "B"), TODAY);
    expect(noDriver.hints.join(" ")).toContain("Nobody can drive");
    const renter = withProfile(person("b", "Ben", { willing_to_drive: true }), { has_license: true, can_rent: true });
    const r = scorePair(person("a", "A"), renter, TODAY);
    expect(r.score).toBeGreaterThan(noDriver.score);
    expect(r.reasons.join(" ")).toContain("Ben can drive a rental car");
  });

  it("explains when someone would need to shift their dates (Vegas Thu–Sat vs Fri–Sun)", () => {
    const me = person("a", "A", { destinations: ["las-vegas"], date_mode: "flex", preferred_start: "2026-11-26", preferred_end: "2026-11-28", flex_days: 1, trip_length_min: 3, trip_length_max: 3 });
    const them = person("b", "B", { destinations: ["las-vegas"], date_mode: "flex", preferred_start: "2026-11-27", preferred_end: "2026-11-29", flex_days: 1, trip_length_min: 3, trip_length_max: 3 });
    const r = scorePair(me, them, TODAY);
    expect(r.eligible).toBe(true);
    expect(r.hints.some((h) => h.includes("adjust"))).toBe(true);
  });

  it("pairs and groups come back in ONE list", () => {
    const r = findPotentialTrips([person("a", "A")], [person("b", "B"), person("c", "C")], new Set(), TODAY);
    expect(r.trips.map((t) => t.size).sort()).toEqual([2, 2, 3]);
  });

  it("never shows classmates' names on Match (anonymous until the chat opens)", () => {
    const me = person("a", "Me", { date_mode: "flex", preferred_start: "2026-11-26", preferred_end: "2026-11-28", flex_days: 1, trip_length_min: 3, trip_length_max: 3 });
    const them = person("b", "Jamie Sun", { date_mode: "flex", preferred_start: "2026-11-27", preferred_end: "2026-11-29", flex_days: 1, trip_length_min: 3, trip_length_max: 3, bringing_car: true, seats_offered: 3 });
    const text = findPotentialTrips([me], [them], new Set(), TODAY).trips.flatMap((t) => [...t.reasons, ...t.hints]).join(" ");
    expect(text).not.toContain("Jamie");
    expect(text).toContain("classmate");
  });
});
