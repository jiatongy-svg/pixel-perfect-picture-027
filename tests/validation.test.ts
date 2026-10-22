import { describe, expect, it } from "vitest";
import { cleanSupabaseUrl } from "@/lib/env";
import { toPlaces } from "@/lib/places";
import { fieldErrors, planSchema, profileSchema } from "@/lib/validation";
import { TODAY } from "./helpers";

const basePlan = {
  timing_mode: "break" as const, break_id: "thanksgiving" as const, date_mode: "anytime" as const, preferred_start: null, preferred_end: null,
  flex_days: 0, weekends: [], trip_length_min: 2, trip_length_max: 4, destinations: toPlaces(["joshua-tree"]), destination_flex: "open_to_nearby" as const,
  budget_min: 100, budget_max: 300, vibes: ["outdoors" as const], bringing_car: false, seats_offered: 0, bringing_gear: [], notes: "",
};
const parse = (over: object) => planSchema(TODAY).safeParse({ ...basePlan, ...over });

describe("plan validation (server side)", () => {
  it("accepts a normal plan", () => expect(parse({}).success).toBe(true));

  it("rejects budget min above max with a field message", () => {
    const r = parse({ budget_min: 500, budget_max: 100 });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).budget_max).toMatch(/at least the minimum/);
  });

  it("rejects dates out of order or outside the break", () => {
    expect(parse({ date_mode: "fixed", preferred_start: "2026-11-28", preferred_end: "2026-11-26" }).success).toBe(false);
    expect(parse({ date_mode: "fixed", preferred_start: "2026-12-01", preferred_end: "2026-12-03" }).success).toBe(false);
  });

  it("sets trip length from fixed dates", () => {
    const r = parse({ date_mode: "fixed", preferred_start: "2026-11-26", preferred_end: "2026-11-28" });
    expect(r.success && [r.data.trip_length_min, r.data.trip_length_max]).toEqual([3, 3]);
  });

  it("only allows upcoming Fridays for weekends, and clears break fields", () => {
    expect(parse({ timing_mode: "weekends", weekends: ["2026-10-24"], trip_length_max: 3 }).success).toBe(false); // Saturday
    expect(parse({ timing_mode: "weekends", weekends: ["2027-06-04"], trip_length_max: 3 }).success).toBe(false); // too far ahead
    const r = parse({ timing_mode: "weekends", weekends: ["2026-11-06", "2026-10-23"], trip_length_max: 3 });
    expect(r.success && r.data).toMatchObject({ break_id: null, date_mode: null, weekends: ["2026-10-23", "2026-11-06"] });
  });

  it("rejects unknown enums, destinations and over-long notes", () => {
    expect(parse({ vibes: ["partying"] }).success).toBe(false);
    expect(parse({ destinations: [{ key: "atlantis", name: "Atlantis", lat: 0, lon: 0 }] }).success).toBe(false);
    expect(parse({ destinations: [{ key: "geo:1857910", name: "Kyoto", country: "Japan", lat: 35.02, lon: 135.75 }] }).success).toBe(true);
    expect(parse({ destinations: [{ key: "geo:1", name: "Nowhere", lat: 999, lon: 0 }] }).success).toBe(false);
    expect(parse({ notes: "x".repeat(501) }).success).toBe(false);
  });

  it("requires a destination unless the student is open to anywhere", () => {
    expect(parse({ destinations: [], destination_flex: "fixed" }).success).toBe(false);
    expect(parse({ destinations: [], destination_flex: "open" }).success).toBe(true);
  });
});

describe("profile validation", () => {
  const base = { display_name: "Navya", msba_year: "1st", photo_path: null, bio: "", travel_experience: "some", pace: "balanced", schedule: "flexible", lodging_prefs: [], has_car: false, car_seats: 0, equipment: [], mbti: null };
  it("needs a name and a car seat count when there's a car", () => {
    expect(profileSchema.safeParse({ ...base, display_name: "  " }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, has_car: true, car_seats: 0 }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, has_car: true, car_seats: 3 }).success).toBe(true);
  });
  it("accepts a real MBTI type or none, nothing else", () => {
    expect(profileSchema.safeParse({ ...base, mbti: "ENFP" }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, mbti: "ABCD" }).success).toBe(false);
  });
  it("zeroes seats when there's no car", () => {
    const r = profileSchema.safeParse({ ...base, car_seats: 4 });
    expect(r.success && r.data.car_seats).toBe(0);
  });
});

describe("Supabase URL cleanup", () => {
  it("accepts the Project URL or the REST URL", () => {
    expect(cleanSupabaseUrl("https://abcd.supabase.co")).toBe("https://abcd.supabase.co");
    expect(cleanSupabaseUrl("https://abcd.supabase.co/rest/v1/")).toBe("https://abcd.supabase.co");
    expect(cleanSupabaseUrl(" https://abcd.supabase.co/ ")).toBe("https://abcd.supabase.co");
  });
});
