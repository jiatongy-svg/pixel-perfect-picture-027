// ============================================================================
// types.ts — the shapes of data that move around the app.
//
// These mirror the database tables in supabase/schema.sql. If you add a
// column there, add it here too.
// ============================================================================
import type { BreakId, EquipmentId, ExperienceId, LodgingId, PaceId, ScheduleId, VibeId } from "./catalog";
import type { Place } from "./places";

// One row of the `profiles` table: the student's travel profile.
export type Profile = {
  id: string;
  display_name: string;
  msba_year: "1st" | "2nd";
  photo_path: string | null;
  bio: string;
  travel_experience: ExperienceId;
  pace: PaceId;
  schedule: ScheduleId;
  lodging_prefs: LodgingId[];
  has_car: boolean;
  car_seats: number; // passenger seats (not counting the driver)
  equipment: EquipmentId[];
  mbti: Mbti | null; // optional; shown for reference only, never part of the score
  completed: boolean;
};

export const MBTI_TYPES = ["ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP", "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ"] as const;
export type Mbti = (typeof MBTI_TYPES)[number];

export type DateMode = "anytime" | "fixed" | "flex";
export type DestinationFlex = "fixed" | "open_to_nearby" | "open";

// One row of `travel_plans` — one of the student's trip plans (up to 5).
// `title` and `notes` are private to the owner and never shown to classmates.
export type Plan = {
  id: string;
  user_id: string;
  title: string;
  timing_mode: "break" | "weekends";
  break_id: BreakId | null;
  date_mode: DateMode | null; // only for timing_mode = "break"
  preferred_start: string | null; // YYYY-MM-DD
  preferred_end: string | null;
  flex_days: number; // ± days, only for date_mode = "flex"
  weekends: string[]; // Fridays, YYYY-MM-DD, only for timing_mode = "weekends"
  trip_length_min: number;
  trip_length_max: number;
  destinations: Place[]; // ordered, most wanted first (quick picks or any searched city)
  destination_flex: DestinationFlex;
  budget_min: number;
  budget_max: number;
  vibes: VibeId[];
  bringing_car: boolean;
  seats_offered: number;
  bringing_gear: EquipmentId[];
  notes?: string;
  updated_at?: string;
};

// The plan fields classmates are allowed to see (everything except title and notes).
export type PublicPlan = Omit<Plan, "notes" | "title">;

// A student WITH ONE OF THEIR PLANS, as the matcher sees them. Someone with
// three plans appears as three Persons (same id, different plan.id).
export type Person = {
  id: string;
  name: string;
  msbaYear: "1st" | "2nd";
  profile: Pick<Profile, "has_car" | "car_seats" | "equipment" | "travel_experience" | "pace" | "schedule" | "lodging_prefs" | "bio" | "photo_path" | "mbti">;
  plan: PublicPlan;
};

// Inclusive date range, stored as YYYY-MM-DD strings.
export type DateRange = { start: string; end: string };
