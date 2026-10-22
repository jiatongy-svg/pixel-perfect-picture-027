export type BreakId = "thanksgiving" | "winter" | "spring" | "weekend";
export type Vibe = "Adventure" | "Artsy" | "Touristy" | "Relaxed";
export type Budget = "under300" | "300-700" | "700plus";
export type Gear = "car" | "tent";

export const BREAKS: { id: BreakId; label: string; start: string; end: string }[] = [
  { id: "thanksgiving", label: "Thanksgiving", start: "2026-11-25", end: "2026-11-29" },
  { id: "winter", label: "Winter break", start: "2026-12-19", end: "2027-01-03" },
  { id: "spring", label: "Spring break", start: "2027-03-13", end: "2027-03-21" },
  { id: "weekend", label: "A weekend", start: "2026-11-07", end: "2026-11-08" },
];

export const VIBES: Vibe[] = ["Adventure", "Artsy", "Touristy", "Relaxed"];

export const BUDGETS: { id: Budget; label: string; mid: number }[] = [
  { id: "under300", label: "Under $300", mid: 220 },
  { id: "300-700", label: "$300–700", mid: 500 },
  { id: "700plus", label: "$700+", mid: 950 },
];

export type Destination = {
  name: string;
  min: number;
  max: number;
  car: boolean;
  start: string;
  end: string;
  activities: string[];
};

const d = (
  name: string, min: number, max: number, car: boolean, start: string, end: string, activities: string[],
): Destination => ({ name, min, max, car, start, end, activities });

export const DESTINATIONS: Record<BreakId, Destination[]> = {
  thanksgiving: [
    d("Joshua Tree", 150, 350, true, "2026-11-26", "2026-11-29", ["Hidden Valley loop hike", "Stargazing at Cottonwood", "Skull Rock & Arch Rock", "Pioneertown dinner"]),
    d("Zion & Bryce", 400, 750, true, "2026-11-25", "2026-11-29", ["Drive to Springdale", "Angels Landing / Riverside Walk", "Bryce Canyon sunrise", "Navajo Loop hike", "Drive home"]),
    d("Yosemite", 250, 550, true, "2026-11-26", "2026-11-29", ["Tunnel View & Valley floor", "Mist Trail hike", "Mariposa Grove", "Glacier Point views"]),
    d("Las Vegas", 300, 700, false, "2026-11-26", "2026-11-28", ["The Strip & Bellagio fountains", "Red Rock Canyon", "A show and late dinner"]),
    d("San Diego", 200, 450, false, "2026-11-27", "2026-11-29", ["La Jolla Cove & seals", "Balboa Park", "Little Italy food crawl"]),
  ],
  winter: [
    d("Big Bear (ski)", 300, 600, true, "2026-12-20", "2026-12-23", ["Drive up & rentals", "Ski Snow Summit", "Bear Mountain park day", "Village brunch"]),
    d("San Francisco", 400, 800, false, "2026-12-27", "2026-12-30", ["Golden Gate bike ride", "Mission burritos & murals", "Alcatraz", "Ferry Building"]),
    d("Mammoth Lakes", 450, 850, true, "2026-12-20", "2026-12-24", ["Drive via 395", "Ski Mammoth Mountain", "Hot springs soak", "Ski day 2", "Drive home"]),
    d("Seattle", 450, 850, false, "2026-12-28", "2026-12-31", ["Pike Place & waterfront", "Capitol Hill coffee crawl", "Day trip to Snoqualmie", "Space Needle"]),
    d("Tokyo", 1400, 2500, false, "2026-12-26", "2027-01-02", ["Shibuya & Harajuku", "Asakusa temples", "teamLab Planets", "Day trip to Hakone", "Tsukiji breakfast", "Shinjuku nightlife", "New Year's shrine visit", "Fly home"]),
  ],
  spring: [
    d("Cabo San Lucas", 700, 1300, false, "2027-03-14", "2027-03-18", ["Arrive & beach", "El Arco boat tour", "Snorkel Santa Maria", "San José del Cabo art walk", "Fly home"]),
    d("Cancun", 700, 1300, false, "2027-03-14", "2027-03-19", ["Hotel zone beach", "Isla Mujeres", "Chichén Itzá", "Cenote swim", "Tulum ruins", "Fly home"]),
    d("Hawaii (Oahu)", 900, 1600, false, "2027-03-14", "2027-03-19", ["Waikiki", "Diamond Head sunrise", "North Shore surf", "Kualoa Ranch", "Hanauma Bay", "Fly home"]),
    d("Grand Canyon & Sedona", 400, 800, true, "2027-03-15", "2027-03-19", ["Drive to Sedona", "Cathedral Rock hike", "Grand Canyon South Rim", "Bright Angel Trail", "Drive home"]),
    d("New York City", 800, 1500, false, "2027-03-14", "2027-03-18", ["Central Park & the Met", "Brooklyn Bridge & DUMBO", "Broadway show", "West Village food", "Fly home"]),
  ],
  weekend: [
    d("Santa Barbara", 150, 350, true, "2026-11-07", "2026-11-08", ["Funk Zone wine & State St", "Butterfly Beach & Mission"]),
    d("Malibu & El Matador Beach", 50, 150, true, "2026-11-07", "2026-11-07", ["El Matador sunset & Point Dume"]),
    d("Palm Springs", 200, 400, true, "2026-11-07", "2026-11-08", ["Pool day & downtown", "Aerial Tramway & Indian Canyons"]),
    d("Catalina Island", 200, 400, false, "2026-11-07", "2026-11-08", ["Ferry & Avalon snorkel", "Golf cart island loop"]),
    d("San Diego", 150, 350, false, "2026-11-07", "2026-11-08", ["La Jolla Cove", "Balboa Park & Little Italy"]),
  ],
};

export function findDestination(breakId: BreakId, name: string): Destination | undefined {
  return DESTINATIONS[breakId].find((x) => x.name.toLowerCase() === name.toLowerCase());
}

export type TripProfile = {
  id: string;
  email: string;
  first_name: string;
  msba_year: string;
  break_id: BreakId;
  vibes: Vibe[];
  destinations: string[]; // ranked
  start_date: string;
  end_date: string;
  budget: Budget;
  gear: Gear[];
};

export type Plan = { destination: string; start_date: string; end_date: string };

export type MergeChange = { field: string; from: string; to: string; reason: string };
export type MergedPlan = Plan & { changes: MergeChange[]; summary: string };
