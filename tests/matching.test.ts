import { describe, expect, it } from "vitest";
import { MIN_MATCH_SCORE } from "@/lib/constants";
import { dateFit, planWindows, budgetFit, destinationFit } from "@/lib/feasibility";
import { findGroupMatches, findPairMatches, memberKey, scorePair } from "@/lib/matching";
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
  it("scores identical plans 100 with at least two data-backed reasons", () => {
    const r = scorePair(person("a", "Ana"), person("b", "Ben"), TODAY);
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
    // dates 35 + destination 30 + budget 20 * (overlap 100 / narrowest range 250) + vibes 0
    expect(r.score).toBe(Math.round(35 + 30 + (20 * 100) / 250));
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
    const groups = findGroupMatches(me, [person("b", "Ben"), person("c", "Cy")], new Set(), new Set(), TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(memberKey(["a", "b", "c"]));
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
    expect(findGroupMatches(a2, [b, c], new Set(), new Set(), TODAY)).toHaveLength(0);
  });
  it("hides a passed group and groups with a passed person", () => {
    const others = [person("b", "Ben"), person("c", "Cy")];
    expect(findGroupMatches(me, others, new Set(), new Set([memberKey(["a", "b", "c"])]), TODAY)).toHaveLength(0);
    expect(findGroupMatches(me, others, new Set(["c"]), new Set(), TODAY)).toHaveLength(0);
  });
  it("breaks ties by weakest pair, then ids", () => {
    const others = [person("b", "B"), person("c", "C"), person("d", "D")];
    const groups = findGroupMatches(me, others, new Set(), new Set(), TODAY);
    expect(groups.map((g) => g.key)).toEqual(["a,b,c", "a,b,c,d", "a,b,d", "a,c,d"]);
  });
});
