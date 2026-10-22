// ============================================================================
// catalog.ts — the fixed lists students pick from.
//
// Breaks, vibes, equipment, preferences and destinations all live here so the
// form, the matcher and the merge logic always agree on the same ids.
// The database stores the short ids (for example "joshua-tree"), never labels.
// ============================================================================

// ---------------------------------------------------------------------------
// Long breaks (2026–27 academic year)
// ---------------------------------------------------------------------------
// Double-check these against the official USC academic calendar each year.
export const BREAKS = [
  { id: "thanksgiving", label: "Thanksgiving break", start: "2026-11-25", end: "2026-11-29" },
  { id: "winter", label: "Winter break", start: "2026-12-19", end: "2027-01-10" },
  { id: "spring", label: "Spring break", start: "2027-03-13", end: "2027-03-21" },
] as const;
export type BreakId = (typeof BREAKS)[number]["id"];
export const BREAK_IDS = BREAKS.map((b) => b.id) as [BreakId, ...BreakId[]];
export const findBreak = (id: string) => BREAKS.find((b) => b.id === id);

// ---------------------------------------------------------------------------
// Vibes — each one has a plain-English description and real examples so two
// students mean the same thing when they pick it.
// ---------------------------------------------------------------------------
export const VIBES = [
  {
    id: "outdoors",
    label: "Outdoors",
    description: "Fresh air is the point of the trip.",
    examples: "Day hikes, camping, sunrise viewpoints, stargazing",
  },
  {
    id: "food",
    label: "Food",
    description: "Plan the day around where you'll eat.",
    examples: "Taco crawls, farmers markets, one splurge dinner",
  },
  {
    id: "nightlife",
    label: "Nightlife",
    description: "Late nights out are part of the plan.",
    examples: "Bars, live music, a show, dancing",
  },
  {
    id: "relaxed",
    label: "Relaxed",
    description: "Low-key, no alarms, nothing rushed.",
    examples: "Pool or beach days, reading, a spa afternoon",
  },
  {
    id: "culture",
    label: "Culture",
    description: "Museums, history and neighborhoods.",
    examples: "Art museums, walking tours, architecture, local markets",
  },
  {
    id: "adventure",
    label: "Adventure",
    description: "Push it a little and try something new.",
    examples: "Ski days, snorkeling, long or steep hikes, kayaking",
  },
] as const;
export type VibeId = (typeof VIBES)[number]["id"];
export const VIBE_IDS = VIBES.map((v) => v.id) as [VibeId, ...VibeId[]];
export const vibeLabel = (id: string) => VIBES.find((v) => v.id === id)?.label.toLowerCase() ?? id;

// ---------------------------------------------------------------------------
// Personal equipment (lives on the profile). On a specific trip plan, a student
// chooses which of THESE they're willing to bring.
// ---------------------------------------------------------------------------
export const EQUIPMENT = [
  { id: "tent", label: "Tent" },
  { id: "sleeping_bag", label: "Sleeping bag" },
  { id: "camp_stove", label: "Camp stove" },
  { id: "cooler", label: "Cooler" },
  { id: "hiking_gear", label: "Hiking gear" },
  { id: "ski_gear", label: "Ski / snowboard gear" },
  { id: "beach_gear", label: "Beach gear" },
] as const;
export type EquipmentId = (typeof EQUIPMENT)[number]["id"];
export const EQUIPMENT_IDS = EQUIPMENT.map((e) => e.id) as [EquipmentId, ...EquipmentId[]];
export const equipmentLabel = (id: string) => EQUIPMENT.find((e) => e.id === id)?.label ?? id;

// ---------------------------------------------------------------------------
// Travel profile preferences
// ---------------------------------------------------------------------------
export const EXPERIENCE = [
  { id: "new", label: "Just starting", description: "Few trips with friends so far. Happy to follow a plan." },
  { id: "some", label: "Some trips", description: "A handful of trips. Can help plan." },
  { id: "seasoned", label: "Seasoned", description: "Planned lots of trips. Happy to lead." },
] as const;
export const PACE = [
  { id: "chill", label: "Chill", description: "One or two things a day" },
  { id: "balanced", label: "Balanced", description: "A plan, with downtime" },
  { id: "packed", label: "Packed", description: "See as much as possible" },
] as const;
export const SCHEDULE = [
  { id: "early", label: "Early bird" },
  { id: "flexible", label: "Flexible" },
  { id: "night", label: "Night owl" },
] as const;
export const LODGING = [
  { id: "camping", label: "Camping" },
  { id: "budget", label: "Budget stay" },
  { id: "airbnb", label: "Airbnb" },
  { id: "hotel", label: "Hotel" },
] as const;
export type ExperienceId = (typeof EXPERIENCE)[number]["id"];
export type PaceId = (typeof PACE)[number]["id"];
export type ScheduleId = (typeof SCHEDULE)[number]["id"];
export type LodgingId = (typeof LODGING)[number]["id"];

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------
// region      — used for "open to nearby": places in the same region count as nearby
// access      — drive (from LA), fly, or either
// milesFromLA — one-way driving distance, used for the gas estimate (rounded)
// flight      — rough round-trip flight range per person [low, high], fly-only places
// lodging     — which lodging cost tier to use (see COSTS in constants.ts)
// activities  — rough per-person range for park fees / tickets for the whole trip
// ideas       — generic day themes for the suggested outline (NOT live venue data)
// gear        — gear that's useful there, used for the "nobody listed X" hint
export const REGIONS = {
  "socal-coast": "SoCal coast",
  "socal-desert": "SoCal desert",
  mountains: "Sierra & mountains",
  southwest: "Southwest",
  "norcal-pnw": "NorCal & Pacific Northwest",
  "fly-far": "Fly-to trips",
} as const;
export type RegionId = keyof typeof REGIONS;

export type Destination = {
  id: string;
  name: string;
  region: RegionId;
  access: "drive" | "fly" | "either";
  milesFromLA: number;
  flight?: readonly [number, number];
  lodging: "camp" | "low" | "mid" | "high";
  activities: readonly [number, number];
  vibes: readonly VibeId[];
  ideas: readonly string[];
  gear: readonly EquipmentId[];
};

export const DESTINATIONS: readonly Destination[] = [
  // SoCal coast
  { id: "san-diego", name: "San Diego", region: "socal-coast", access: "drive", milesFromLA: 120, lodging: "mid", activities: [0, 60], vibes: ["food", "relaxed", "culture", "nightlife"], ideas: ["Coastal walk and tide pools", "Museum and park day", "Neighborhood food crawl", "Beach morning"], gear: ["beach_gear"] },
  { id: "santa-barbara", name: "Santa Barbara", region: "socal-coast", access: "drive", milesFromLA: 95, lodging: "mid", activities: [0, 40], vibes: ["food", "relaxed", "culture"], ideas: ["Downtown and waterfront", "Mission and gardens", "Wine tasting or beach afternoon"], gear: ["beach_gear"] },
  { id: "malibu", name: "Malibu coast", region: "socal-coast", access: "drive", milesFromLA: 35, lodging: "high", activities: [0, 20], vibes: ["relaxed", "outdoors"], ideas: ["Beach coves and sunset", "Coastal canyon hike"], gear: ["beach_gear", "hiking_gear"] },
  { id: "catalina", name: "Catalina Island", region: "socal-coast", access: "drive", milesFromLA: 25, lodging: "high", activities: [80, 160], vibes: ["relaxed", "adventure", "outdoors"], ideas: ["Ferry over and explore town", "Snorkel or kayak", "Island loop"], gear: ["beach_gear"] },
  // SoCal desert
  { id: "joshua-tree", name: "Joshua Tree", region: "socal-desert", access: "drive", milesFromLA: 130, lodging: "camp", activities: [10, 40], vibes: ["outdoors", "adventure", "relaxed"], ideas: ["Short loop hikes among rock formations", "Stargazing night", "Scenic drive through the park", "Desert town breakfast"], gear: ["tent", "sleeping_bag", "camp_stove", "hiking_gear", "cooler"] },
  { id: "palm-springs", name: "Palm Springs", region: "socal-desert", access: "drive", milesFromLA: 110, lodging: "mid", activities: [0, 60], vibes: ["relaxed", "nightlife", "food"], ideas: ["Pool day", "Canyon hike", "Mid-century architecture walk"], gear: ["beach_gear"] },
  // Mountains
  { id: "big-bear", name: "Big Bear", region: "mountains", access: "drive", milesFromLA: 100, lodging: "mid", activities: [0, 200], vibes: ["adventure", "outdoors", "relaxed"], ideas: ["Drive up and settle in", "Ski or snow day", "Lake walk and village"], gear: ["ski_gear", "cooler"] },
  { id: "mammoth", name: "Mammoth Lakes", region: "mountains", access: "drive", milesFromLA: 310, lodging: "mid", activities: [0, 250], vibes: ["adventure", "outdoors"], ideas: ["Scenic drive up 395", "Ski or hike day", "Hot springs afternoon", "Second mountain day"], gear: ["ski_gear", "hiking_gear"] },
  { id: "yosemite", name: "Yosemite", region: "mountains", access: "drive", milesFromLA: 300, lodging: "camp", activities: [35, 60], vibes: ["outdoors", "adventure"], ideas: ["Valley floor viewpoints", "Waterfall hike", "Giant sequoias", "Big viewpoint at sunset"], gear: ["tent", "sleeping_bag", "camp_stove", "hiking_gear", "cooler"] },
  // Southwest
  { id: "las-vegas", name: "Las Vegas", region: "southwest", access: "drive", milesFromLA: 270, lodging: "low", activities: [0, 150], vibes: ["nightlife", "food", "adventure"], ideas: ["The Strip at night", "Red rock day trip", "A show and late dinner"], gear: [] },
  { id: "zion-bryce", name: "Zion & Bryce", region: "southwest", access: "drive", milesFromLA: 420, lodging: "camp", activities: [35, 70], vibes: ["outdoors", "adventure"], ideas: ["Long drive and canyon arrival", "Big canyon hike", "Sunrise at the amphitheater", "Rim trail and drive home"], gear: ["tent", "sleeping_bag", "hiking_gear", "camp_stove"] },
  { id: "grand-canyon-sedona", name: "Grand Canyon & Sedona", region: "southwest", access: "drive", milesFromLA: 480, lodging: "low", activities: [35, 70], vibes: ["outdoors", "adventure", "relaxed"], ideas: ["Drive to Sedona", "Red rock hike", "Canyon rim day", "Drive home"], gear: ["hiking_gear"] },
  // NorCal & PNW
  { id: "big-sur", name: "Big Sur", region: "norcal-pnw", access: "drive", milesFromLA: 300, lodging: "camp", activities: [10, 40], vibes: ["outdoors", "relaxed"], ideas: ["Coastal drive with pullouts", "Redwood hike", "Beach and waterfall stops"], gear: ["tent", "sleeping_bag", "hiking_gear"] },
  { id: "san-francisco", name: "San Francisco", region: "norcal-pnw", access: "either", milesFromLA: 380, flight: [100, 250], lodging: "high", activities: [20, 80], vibes: ["food", "culture", "nightlife"], ideas: ["Waterfront and bridge views", "Neighborhood food crawl", "Museum day", "Park and city views"], gear: [] },
  { id: "seattle", name: "Seattle", region: "norcal-pnw", access: "fly", milesFromLA: 1135, flight: [150, 350], lodging: "high", activities: [20, 80], vibes: ["food", "culture", "outdoors"], ideas: ["Market and waterfront", "Coffee and neighborhoods", "Day trip to the mountains or a waterfall"], gear: ["hiking_gear"] },
  // Fly-to
  { id: "new-york", name: "New York City", region: "fly-far", access: "fly", milesFromLA: 2790, flight: [250, 550], lodging: "high", activities: [40, 200], vibes: ["culture", "food", "nightlife"], ideas: ["Big park and a major museum", "Bridge walk and neighborhoods", "A show", "Food day"], gear: [] },
  { id: "oahu", name: "Oahu, Hawaii", region: "fly-far", access: "fly", milesFromLA: 2560, flight: [300, 650], lodging: "high", activities: [40, 200], vibes: ["relaxed", "outdoors", "adventure"], ideas: ["Beach afternoon", "Sunrise crater hike", "North Shore day", "Snorkel day"], gear: ["beach_gear", "hiking_gear"] },
  { id: "cabo", name: "Cabo San Lucas", region: "fly-far", access: "fly", milesFromLA: 1060, flight: [250, 550], lodging: "mid", activities: [40, 200], vibes: ["relaxed", "nightlife", "adventure"], ideas: ["Beach day", "Boat or snorkel trip", "Old town art walk"], gear: ["beach_gear"] },
  { id: "cancun", name: "Cancún & Tulum", region: "fly-far", access: "fly", milesFromLA: 2200, flight: [300, 600], lodging: "mid", activities: [50, 220], vibes: ["relaxed", "culture", "adventure", "nightlife"], ideas: ["Beach day", "Ruins day trip", "Cenote swim", "Island day"], gear: ["beach_gear"] },
  { id: "tokyo", name: "Tokyo", region: "fly-far", access: "fly", milesFromLA: 5470, flight: [700, 1400], lodging: "mid", activities: [50, 250], vibes: ["food", "culture", "nightlife"], ideas: ["Arrive and explore a neighborhood", "Temples and old town", "Food markets", "Day trip outside the city", "Night out"], gear: [] },
];
export const DESTINATION_IDS = DESTINATIONS.map((d) => d.id);
export const findDestination = (id: string) => DESTINATIONS.find((d) => d.id === id);
