// ============================================================================
// constants.ts — every tunable number in TripMatch lives here.
//
// If you want to change how matching or cost estimates behave, this is the
// ONLY file you should need to edit. Each value has a comment saying what it
// does and what happens if you raise or lower it.
// ============================================================================

// ---------------------------------------------------------------------------
// 1. Match score weights (must add up to 100)
// ---------------------------------------------------------------------------
// A match score is built from four parts. Each part produces a number between
// 0 and 1, which is then multiplied by its weight below.
export const WEIGHTS = {
  dates: 35, // how many days you can actually travel together
  destination: 30, // whether you want the same place
  budget: 20, // how much your budget ranges overlap
  vibes: 15, // how similar your trip vibes are (Jaccard similarity)
} as const;

// A pair (or every pair inside a group) must score at least this to be shown.
// Raise it to show fewer, stronger matches. Lower it to show more.
export const MIN_MATCH_SCORE = 40;

// How many matches / groups to show at most on the Matches page.
export const MAX_RESULTS = 5;

// ---------------------------------------------------------------------------
// 2. Hard-constraint thresholds
// ---------------------------------------------------------------------------
// Budgets must overlap by at least this many dollars. 0 means "any overlap,
// even touching" (for example $100–$200 and $200–$300 still count).
export const MIN_BUDGET_OVERLAP = 0;

// Two people need at least this many shared days for a trip to make sense.
// If someone only wants a 1-day trip, we use their shorter length instead.
export const MIN_SHARED_DAYS = 2;

// Partial credit for the destination score when you don't list the same place:
//   NEARBY  — one of you listed it and the other is "open to nearby" in that region
//   OPEN    — the other person is fully open to anywhere
export const DESTINATION_PARTIAL = {
  nearby: 0.6,
  open: 0.4,
} as const;

// ---------------------------------------------------------------------------
// 3. Group matching
// ---------------------------------------------------------------------------
// Groups include the signed-in user. 3 = you + 2 classmates.
export const MIN_GROUP_SIZE = 3;
// Change to 5 or 6 later if the pilot grows. Bigger numbers mean many more
// combinations to check, but with 6 people this is still instant.
export const MAX_GROUP_SIZE = 4;

// ---------------------------------------------------------------------------
// 4. Plan form limits (also enforced by the database, see supabase/schema.sql)
// ---------------------------------------------------------------------------
export const PLAN_LIMITS = {
  maxDestinations: 5,
  maxWeekends: 8,
  maxTripDays: 14,
  maxBudget: 10_000,
  maxNotes: 500,
  maxFlexDays: 7,
  // Weekends can be picked from "next Friday" up to this many days ahead (~3 months).
  weekendHorizonDays: 92,
} as const;

export const PROFILE_LIMITS = {
  maxName: 40,
  maxBio: 280,
  maxSeats: 7,
  maxPhotoBytes: 2 * 1024 * 1024, // 2 MB
} as const;

// ---------------------------------------------------------------------------
// 5. Cost estimates — ROUGH RANGES, NOT QUOTES
// ---------------------------------------------------------------------------
// These are deliberately broad dollar ranges [low, high] used to give students
// a ballpark. They are not live prices and the UI always labels them "Estimate".
// Update them whenever you like; nothing else needs to change.
export const COSTS = {
  // Lodging, per person per night, split evenly across the group.
  lodgingPerPersonNight: {
    camp: [10, 20], // shared campsite
    low: [40, 70], // motel / budget Airbnb split 3–4 ways
    mid: [55, 100], // typical Airbnb or hotel split
    high: [80, 150], // big-city or resort area
  },
  // Gas only, per car, per mile driven (round trip).
  gasPerMile: [0.15, 0.25],
  // Rental car per day, used when the destination is a drive and nobody brings a car.
  rentalPerDay: [55, 90],
  // Groceries / snacks for the group, per person per day (shared).
  groceriesPerPersonDay: [12, 20],
  // Eating out, per person per day (individual).
  foodOutPerPersonDay: [25, 45],
} as const;

// Shared costs are split evenly between everyone on the trip.
export const SHARED_SPLIT_LABEL = "Shared costs split evenly; personal costs paid individually";

// ---------------------------------------------------------------------------
// 6. Optional AI merge
// ---------------------------------------------------------------------------
// Only used when the server env var ENABLE_AI_MERGE=true AND ANTHROPIC_API_KEY is set.
export const AI_MODEL = "claude-opus-5-5";
export const AI_TIMEOUT_MS = 20_000;
