// Test helpers: build a Person with sensible defaults so each test only
// spells out what it cares about.
import { toPlaces, type Place } from "@/lib/places";
import type { Person, PublicPlan } from "@/lib/types";

// Tests may write destinations as quick-pick ids ("joshua-tree") or full Places.
type PlanOverrides = Omit<Partial<PublicPlan>, "destinations"> & { destinations?: (string | Place)[] };

export const TODAY = "2026-10-21";

export function person(id: string, name: string, overrides: PlanOverrides = {}): Person {
  const { destinations = ["joshua-tree"], ...plan } = overrides;
  return {
    id,
    name,
    msbaYear: "1st",
    profile: { has_car: false, car_seats: 0, equipment: [], travel_experience: "some", pace: "balanced", schedule: "flexible", lodging_prefs: [], bio: "", photo_path: null, mbti: null,
      has_license: false, can_rent: false, vibes: [], group_pref_weekend: "any", group_strict_weekend: false, group_pref_long: "any", group_strict_long: false },
    plan: {
      id: `plan-${id}`,
      user_id: id,
      timing_mode: "break",
      break_id: "thanksgiving",
      date_mode: "anytime",
      preferred_start: null,
      preferred_end: null,
      flex_days: 0,
      weekends: [],
      trip_length_min: 3,
      trip_length_max: 4,
      destinations: toPlaces(destinations),
      destination_flex: "open_to_nearby",
      budget_min: 150,
      budget_max: 400,
      vibes: ["outdoors", "food"],
      bringing_car: false,
      seats_offered: 0,
      bringing_gear: [],
      willing_to_drive: false,
      group_pref: null,
      group_strict: null,
      status: "active",
      ...plan,
    },
  };
}
