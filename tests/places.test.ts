import { describe, expect, it } from "vitest";
import { acceptance, destinationFit } from "@/lib/feasibility";
import { parseFilters, passes, planCategory } from "@/lib/filters";
import { findPairMatches, scorePair, tripCategory } from "@/lib/matching";
import { mergePlans, type MergedTrip } from "@/lib/merge";
import { distanceKm, placeLabel, resolveDestination, toPlaces, type Place } from "@/lib/places";
import { person, TODAY } from "./helpers";

const kyoto: Place = { key: "geo:1857910", name: "Kyoto", country: "Japan", region: "Kyoto", lat: 35.0211, lon: 135.7538 };
const osaka: Place = { key: "geo:1853909", name: "Osaka", country: "Japan", region: "Osaka", lat: 34.6937, lon: 135.5023 };
const sdSearched: Place = { key: "geo:5391811", name: "San Diego", country: "United States", region: "California", lat: 32.7157, lon: -117.1647 };

describe("places", () => {
  it("measures distance on the globe", () => {
    expect(Math.round(distanceKm(kyoto, osaka))).toBeGreaterThan(35);
    expect(Math.round(distanceKm(kyoto, osaka))).toBeLessThan(60);
  });
  it("reads old plain-id destinations", () => {
    expect(toPlaces(["joshua-tree"])[0]).toMatchObject({ key: "joshua-tree", name: "Joshua Tree" });
  });
  it("labels searched cities with their state or country", () => {
    expect(placeLabel(kyoto)).toBe("Kyoto, Japan");
    expect(placeLabel(sdSearched)).toBe("San Diego, California");
  });
  it("estimates trip details for any city (fly when far from LA)", () => {
    const d = resolveDestination(kyoto);
    expect(d.access).toBe("fly");
    expect(d.flight![0]).toBeGreaterThan(500);
  });
});

describe("matching anywhere in the world", () => {
  it("the same city picked two ways counts as the same place", () => {
    const a = person("a", "A", { destinations: ["san-diego"], destination_flex: "fixed" });
    expect(acceptance(a.plan, sdSearched)).toEqual({ kind: "listed", rank: 0 });
  });
  it("open to nearby accepts a city within 250 km, not one farther away", () => {
    const a = person("a", "A", { destinations: [kyoto], destination_flex: "open_to_nearby" });
    expect(acceptance(a.plan, osaka)).toEqual({ kind: "nearby" });
    expect(acceptance(a.plan, toPlaces(["tokyo"])[0])).toBeNull(); // ~370 km
  });
  it("two students who both searched Kyoto match there and get a fly trip", () => {
    const a = person("a", "Ana", { break_id: "winter", destinations: [kyoto], destination_flex: "fixed", budget_min: 800, budget_max: 3000 });
    const b = person("b", "Ben", { break_id: "winter", destinations: [osaka, kyoto], destination_flex: "fixed", budget_min: 800, budget_max: 3000 });
    const fit = destinationFit([a.plan, b.plan]);
    expect(fit.best?.key).toBe(kyoto.key);
    const r = scorePair(a, b, TODAY);
    expect(r.eligible).toBe(true);
    expect(r.reasons[0]).toContain("Kyoto, Japan");
    const m = mergePlans([a, b], TODAY) as MergedTrip;
    expect(m.destination.name).toBe("Kyoto, Japan");
    expect(m.transport.mode).toBe("fly");
    expect(m.costs.individual.some((l) => l.label === "Flights")).toBe(true);
  });
});

describe("categories and filters", () => {
  it("categorizes matches by the shared dates", () => {
    expect(tripCategory({ start: "2026-11-26", end: "2026-11-28" })).toBe("thanksgiving");
    expect(tripCategory({ start: "2026-11-06", end: "2026-11-08" })).toBe("weekend");
    const me = person("m", "Me");
    const r = findPairMatches(me, [person("b", "B")], new Set(), TODAY);
    expect(r.pairs[0].category).toBe("thanksgiving");
  });
  it("parses filters from the URL and ignores junk", () => {
    expect(parseFilters({ when: "winter", vibe: "food", max: "600", q: " tokyo " })).toEqual({ when: "winter", vibe: "food", max: 600, q: "tokyo" });
    expect(parseFilters({ when: "summer", vibe: "party", max: "-5" })).toEqual({ when: "all", vibe: "", max: null, q: "" });
  });
  it("applies when, vibe, budget and destination filters", () => {
    const p = person("a", "A", { vibes: ["food"], budget_min: 300, destinations: [kyoto] }).plan;
    const base = parseFilters({});
    expect(passes(p, { ...base, when: "thanksgiving" }, planCategory(p))).toBe(true);
    expect(passes(p, { ...base, when: "weekend" }, planCategory(p))).toBe(false);
    expect(passes(p, { ...base, vibe: "nightlife" }, "thanksgiving")).toBe(false);
    expect(passes(p, { ...base, max: 200 }, "thanksgiving")).toBe(false);
    expect(passes(p, { ...base, q: "japan" }, "thanksgiving")).toBe(true);
  });
});
