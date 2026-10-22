import { describe, expect, it } from "vitest";
import { mergePlans, type MergedTrip } from "@/lib/merge";
import { person, TODAY } from "./helpers";

const ok = (r: ReturnType<typeof mergePlans>) => {
  if (!r.feasible) throw new Error("expected feasible: " + r.conflicts.join(" | "));
  return r as MergedTrip;
};

describe("mergePlans", () => {
  it("picks shared destination, longest shared dates, and explains why", () => {
    const r = ok(mergePlans([person("a", "Ana"), person("b", "Ben", { destinations: ["yosemite", "joshua-tree"] })], TODAY));
    expect(r.destination.name).toBe("Joshua Tree");
    expect(r.dates).toEqual({ start: "2026-11-25", end: "2026-11-28" });
    expect(r.days).toBe(4);
    expect(r.decisions.join(" ")).toContain("Ana's #1, Ben's #2");
    expect(r.outline).toHaveLength(4);
  });

  it("explains a fixed-date conflict by name", () => {
    const sam = person("s", "Sam", { date_mode: "fixed", preferred_start: "2026-11-25", preferred_end: "2026-11-26" });
    const priya = person("p", "Priya", { date_mode: "fixed", preferred_start: "2026-11-28", preferred_end: "2026-11-29" });
    const r = mergePlans([sam, priya], TODAY);
    expect(r.feasible).toBe(false);
    if (!r.feasible) expect(r.conflicts[0]).toBe("Dates cannot overlap: Sam is fixed Nov 25–26; Priya is fixed Nov 28–29.");
  });

  it("never overrides a fixed destination in a counter", () => {
    const a = person("a", "Ana", { destinations: ["joshua-tree"], destination_flex: "fixed" });
    const r = mergePlans([a, person("b", "Ben")], TODAY, { destinationId: "palm-springs" });
    expect(r.feasible).toBe(false);
    if (!r.feasible) expect(r.conflicts[0]).toContain("Ana");
  });

  it("rejects counter dates outside someone's fixed dates", () => {
    const a = person("a", "Ana", { date_mode: "fixed", preferred_start: "2026-11-25", preferred_end: "2026-11-27" });
    const r = mergePlans([a, person("b", "Ben")], TODAY, { start: "2026-11-26", end: "2026-11-28" });
    expect(r.feasible).toBe(false);
  });

  it("accepts valid counter dates", () => {
    const r = ok(mergePlans([person("a", "Ana"), person("b", "Ben")], TODAY, { start: "2026-11-26", end: "2026-11-28" }));
    expect(r.days).toBe(3);
  });

  it("uses declared cars for transport, and a rental when nobody has one", () => {
    const withCar = ok(mergePlans([person("a", "Ana", { bringing_car: true, seats_offered: 3 }), person("b", "Ben")], TODAY));
    expect(withCar.transport.mode).toBe("drive");
    expect(withCar.transport.text).toContain("Ana's car (3 open seats)");
    const noCar = ok(mergePlans([person("a", "Ana"), person("b", "Ben")], TODAY));
    expect(noCar.transport.mode).toBe("rental");
    expect(noCar.costs.shared.find((l) => l.label === "Gas / car")?.note).toContain("rental");
  });

  it("lists gear people bring and what's missing for the destination", () => {
    const r = ok(mergePlans([person("a", "Ana", { bringing_gear: ["tent"] }), person("b", "Ben", { bringing_gear: ["tent", "cooler"] })], TODAY));
    expect(r.gear.find((g) => g.item === "tent")?.bringers).toEqual(["Ana", "Ben"]);
    expect(r.missingGear).toContain("Sleeping bag");
  });

  it("labels costs as estimates and splits shared costs", () => {
    const r = ok(mergePlans([person("a", "Ana"), person("b", "Ben")], TODAY));
    expect(r.costs.assumptions.join(" ")).toContain("estimates, not live quotes");
    const lodging = r.costs.shared.find((l) => l.label === "Lodging")!;
    expect(lodging.total[0]).toBe(lodging.perPerson[0] * 2);
    expect(r.costs.perPersonTotal[0]).toBeLessThan(r.costs.perPersonTotal[1]);
  });

  it("adds flights for fly-only destinations", () => {
    const a = person("a", "Ana", { break_id: "spring", destinations: ["cabo"], budget_min: 500, budget_max: 2000 });
    const b = person("b", "Ben", { break_id: "spring", destinations: ["cabo"], budget_min: 500, budget_max: 2000 });
    const r = ok(mergePlans([a, b], TODAY));
    expect(r.transport.mode).toBe("fly");
    expect(r.costs.individual.some((l) => l.label === "Flights")).toBe(true);
  });

  it("works for groups of four", () => {
    const people = ["a", "b", "c", "d"].map((id) => person(id, id.toUpperCase(), { bringing_car: id === "a", seats_offered: 4 }));
    const r = ok(mergePlans(people, TODAY));
    expect(r.costs.people).toBe(4);
    expect(r.transport.mode).toBe("drive");
  });
});
