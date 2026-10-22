// Test helpers: build a Person with sensible defaults so each test only
// spells out what it cares about.
import type { Person, PublicPlan } from "@/lib/types";

export const TODAY = "2026-10-21";

export function person(id: string, name: string, plan: Partial<PublicPlan> = {}): Person {
  return {
    id,
    name,
    msbaYear: "1st",
    profile: { has_car: false, car_seats: 0, equipment: [], travel_experience: "some", pace: "balanced", schedule: "flexible", lodging_prefs: [], bio: "", photo_path: null },
    plan: {
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
      destinations: ["joshua-tree"],
      destination_flex: "open_to_nearby",
      budget_min: 150,
      budget_max: 400,
      vibes: ["outdoors", "food"],
      bringing_car: false,
      seats_offered: 0,
      bringing_gear: [],
      ...plan,
    },
  };
}
