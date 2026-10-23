// ============================================================================
// validation.ts — server-side checks for everything a student submits.
//
// The browser form checks too (for quick feedback), but people can bypass a
// browser, so the server re-checks with these rules before saving. The
// database has a third layer of CHECK constraints in schema.sql.
//
// Each rule returns a friendly message tied to the form field it's about.
// ============================================================================
import { z } from "zod";
import { BREAK_IDS, EQUIPMENT_IDS, VIBE_IDS, findBreak, findDestination } from "./catalog";
import { PLAN_LIMITS, PROFILE_LIMITS, TRIPS } from "./constants";
import { daysInclusive, isFriday, isIsoDate, toDay, upcomingFridays } from "./dates";
import { GROUP_PREF_IDS } from "./groupsize";
import { MBTI_TYPES } from "./types";

const isoDate = z.string().refine(isIsoDate, "Pick a valid date");
const unique = <T>(xs: T[]) => new Set(xs).size === xs.length;

// A destination: a quick pick (its id must exist) or a searched city ("geo:123").
// Quick picks always use the official name and coordinates from catalog.ts.
const placeSchema = z
  .object({
    key: z.string().regex(/^([a-z0-9-]{1,40}|geo:\d{1,12})$/, "Unknown destination"),
    name: z.string().trim().min(1).max(80),
    country: z.string().trim().max(60).optional(),
    region: z.string().trim().max(60).optional(),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  })
  .refine((p) => p.key.startsWith("geo:") || !!findDestination(p.key), "Unknown destination")
  .transform((p) => {
    const d = findDestination(p.key);
    return d ? { key: d.id, name: d.name, country: d.country, lat: d.lat, lon: d.lon } : p;
  });

// ---------------------------------------------------------------------------
// Travel profile
// ---------------------------------------------------------------------------
export const profileSchema = z
  .object({
    display_name: z.string().trim().min(1, "Add the name classmates know you by").max(PROFILE_LIMITS.maxName, `Keep it under ${PROFILE_LIMITS.maxName} characters`),
    msba_year: z.enum(["1st", "2nd"], { message: "Pick your MSBA year" }),
    photo_path: z.string().max(200).nullable(),
    bio: z.string().trim().max(PROFILE_LIMITS.maxBio, `Keep it under ${PROFILE_LIMITS.maxBio} characters`),
    travel_experience: z.enum(["new", "some", "seasoned"], { message: "Pick one" }),
    pace: z.enum(["chill", "balanced", "packed"], { message: "Pick one" }),
    schedule: z.enum(["early", "flexible", "night"], { message: "Pick one" }),
    lodging_prefs: z.array(z.enum(["camping", "budget", "airbnb", "hotel"])).max(4).refine(unique, "Duplicate choice"),
    has_car: z.boolean(),
    car_seats: z.number().int().min(0).max(PROFILE_LIMITS.maxSeats, `At most ${PROFILE_LIMITS.maxSeats} passenger seats`),
    equipment: z.array(z.enum(EQUIPMENT_IDS)).max(EQUIPMENT_IDS.length).refine(unique, "Duplicate item"),
    mbti: z.enum(MBTI_TYPES).nullable(),
    vibes: z.array(z.enum(VIBE_IDS)).max(VIBE_IDS.length).refine(unique, "Duplicate vibe"),
    has_license: z.boolean(),
    can_rent: z.boolean(),
    group_pref_weekend: z.enum(GROUP_PREF_IDS),
    group_strict_weekend: z.boolean(),
    group_pref_long: z.enum(GROUP_PREF_IDS),
    group_strict_long: z.boolean(),
  })
  .superRefine((p, ctx) => {
    if (p.has_car && p.car_seats < 1) ctx.addIssue({ code: "custom", path: ["car_seats"], message: "How many passengers can your car take?" });
    if (p.can_rent && !p.has_license) ctx.addIssue({ code: "custom", path: ["can_rent"], message: "Renting a car needs a driver's license" });
  })
  .transform((p) => ({ ...p, car_seats: p.has_car ? p.car_seats : 0 }));
export type ProfileInput = z.input<typeof profileSchema>;

// ---------------------------------------------------------------------------
// Travel plan
// ---------------------------------------------------------------------------
export function planSchema(today: string) {
  const allowedFridays = new Set(upcomingFridays(today, PLAN_LIMITS.weekendHorizonDays));
  return z
    .object({
      title: z.string().trim().max(PLAN_LIMITS.maxTitle, `Keep the name under ${PLAN_LIMITS.maxTitle} characters`).default(""),
      timing_mode: z.enum(["break", "weekends"], { message: "Choose a long break or weekends" }),
      break_id: z.enum(BREAK_IDS).nullable(),
      date_mode: z.enum(["anytime", "fixed", "flex"]).nullable(),
      preferred_start: isoDate.nullable(),
      preferred_end: isoDate.nullable(),
      flex_days: z.number().int().min(0).max(PLAN_LIMITS.maxFlexDays),
      weekends: z.array(isoDate).max(PLAN_LIMITS.maxWeekends, `Pick at most ${PLAN_LIMITS.maxWeekends} weekends`).refine(unique, "Duplicate weekend"),
      trip_length_min: z.number().int().min(1).max(PLAN_LIMITS.maxTripDays),
      trip_length_max: z.number().int().min(1).max(PLAN_LIMITS.maxTripDays),
      destinations: z
        .array(placeSchema)
        .max(PLAN_LIMITS.maxDestinations, `Pick up to ${PLAN_LIMITS.maxDestinations}`)
        .refine((xs) => unique(xs.map((x) => x.key)), "Duplicate destination"),
      destination_flex: z.enum(["fixed", "open_to_nearby", "open"]),
      budget_min: z.number({ message: "Enter a number" }).int("Whole dollars only").min(0, "Can't be negative").max(PLAN_LIMITS.maxBudget),
      budget_max: z.number({ message: "Enter a number" }).int("Whole dollars only").min(0).max(PLAN_LIMITS.maxBudget, `At most $${PLAN_LIMITS.maxBudget.toLocaleString()}`),
      vibes: z.array(z.enum(VIBE_IDS)).max(VIBE_IDS.length).refine(unique, "Duplicate vibe"),
      bringing_car: z.boolean(),
      seats_offered: z.number().int().min(0).max(PROFILE_LIMITS.maxSeats),
      bringing_gear: z.array(z.enum(EQUIPMENT_IDS)).refine(unique, "Duplicate item"),
      willing_to_drive: z.boolean().default(false),
      group_pref: z.enum(GROUP_PREF_IDS).nullable().default(null), // null = use my profile default
      group_strict: z.boolean().nullable().default(null),
      notes: z.string().trim().max(PLAN_LIMITS.maxNotes, `Keep notes under ${PLAN_LIMITS.maxNotes} characters`),
    })
    .superRefine((p, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

      if (p.budget_min > p.budget_max) issue("budget_max", "Max budget must be at least the minimum");
      if (p.trip_length_min > p.trip_length_max) issue("trip_length_max", "Longest trip must be at least the shortest");
      if (p.destination_flex !== "open" && p.destinations.length === 0)
        issue("destinations", "Pick at least one place, or choose “I'm open to anywhere”");
      if (!p.bringing_car && p.seats_offered > 0) issue("seats_offered", "Seats only apply if you're bringing a car");

      if (p.timing_mode === "break") {
        const brk = findBreak(p.break_id ?? "");
        if (!brk) return issue("break_id", "Pick a break");
        if (!p.date_mode) return issue("date_mode", "How set are your dates?");
        if (p.date_mode !== "anytime") {
          if (!p.preferred_start || !p.preferred_end) return issue("preferred_start", "Add your dates");
          if (toDay(p.preferred_end) < toDay(p.preferred_start)) return issue("preferred_end", "End date is before the start date");
          if (toDay(p.preferred_start) < toDay(brk.start) || toDay(p.preferred_end) > toDay(brk.end))
            return issue("preferred_start", `Dates need to fall within ${brk.label}`);
          if (toDay(p.preferred_start) < toDay(today)) return issue("preferred_start", "That date has already passed");
          if (daysInclusive({ start: p.preferred_start, end: p.preferred_end }) > PLAN_LIMITS.maxTripDays)
            issue("preferred_end", `Trips can be at most ${PLAN_LIMITS.maxTripDays} days`);
        }
        if (toDay(brk.end) < toDay(today)) issue("break_id", `${brk.label} has already passed`);
      } else {
        if (p.weekends.length === 0) issue("weekends", "Pick at least one weekend");
        for (const w of p.weekends) {
          if (!isFriday(w) || !allowedFridays.has(w)) {
            issue("weekends", "Pick weekends from the next three months");
            break;
          }
        }
        if (p.trip_length_max > 3) issue("trip_length_max", "Weekend trips are 1–3 days");
      }
    })
    .transform((p) => {
      // Normalize: clear fields that don't apply to the chosen mode, so the
      // database never stores contradictory leftovers from switching modes.
      const out = { ...p };
      if (out.timing_mode === "weekends") {
        Object.assign(out, { break_id: null, date_mode: null, preferred_start: null, preferred_end: null, flex_days: 0 });
        out.weekends = [...out.weekends].sort();
      } else {
        out.weekends = [];
        if (out.date_mode === "anytime") Object.assign(out, { preferred_start: null, preferred_end: null, flex_days: 0 });
        if (out.date_mode === "fixed") {
          const n = daysInclusive({ start: out.preferred_start!, end: out.preferred_end! });
          Object.assign(out, { flex_days: 0, trip_length_min: n, trip_length_max: n });
        }
      }
      if (!out.bringing_car) out.seats_offered = 0;
      return out;
    });
}
export type PlanInput = z.input<ReturnType<typeof planSchema>>;

// ---------------------------------------------------------------------------
// Counter-proposal: new destination and/or dates (+ an optional short note).
// ---------------------------------------------------------------------------
export const counterSchema = z
  .object({
    proposalId: z.string().uuid(),
    version: z.number().int().min(1),
    destinationId: z.string().regex(/^([a-z0-9-]{1,40}|geo:\d{1,12})$/, "Pick a destination"),
    start: isoDate,
    end: isoDate,
    note: z.string().trim().max(300, "Keep it under 300 characters"),
  })
  .refine((c) => toDay(c.end) >= toDay(c.start), { path: ["end"], message: "End date is before the start date" });

// ---------------------------------------------------------------------------
// The group's final plan, filled in from the chat checklist.
// ---------------------------------------------------------------------------
export const finalPlanSchema = z
  .object({
    proposalId: z.string().uuid(),
    version: z.number().int().min(1),
    destinationId: z.string().regex(/^([a-z0-9-]{1,40}|geo:\d{1,12})$/, "Pick a destination"),
    start: isoDate,
    end: isoDate,
    wantMore: z.boolean(), // open the trip to more people on Discover?
    extraSpots: z.number().int().min(1).max(TRIPS.maxExtraSpots).default(1),
    joinDeadline: isoDate.nullable(), // last day people can join (defaults to 2 days before)
    note: z.string().trim().max(300, "Keep it under 300 characters").default(""),
  })
  .refine((c) => toDay(c.end) >= toDay(c.start), { path: ["end"], message: "End date is before the start date" })
  .refine((c) => !c.wantMore || !c.joinDeadline || toDay(c.joinDeadline) <= toDay(c.start), { path: ["joinDeadline"], message: "Sign-ups must close before the trip starts" });

// "I'm going no matter what": publish one of my plans to Discover right away.
export const hostSchema = z.object({
  planId: z.string().uuid(),
  spots: z.number().int().min(1, "Offer at least 1 spot").max(TRIPS.maxExtraSpots),
  joinDeadline: isoDate.nullable(),
});

// Turns zod errors into { field: "message" } for the form.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const key = String(i.path[0] ?? "form");
    if (!out[key]) out[key] = i.message;
  }
  return out;
}
