// ============================================================================
// places.ts — destinations as real places on a map.
//
// A plan's destinations are a ranked list of Places. A Place is either one of
// the popular quick picks in catalog.ts (key = its id, e.g. "joshua-tree") or
// any city found through the world city search (key = "geo:<number>").
// Because every place has coordinates, we can tell when two students mean the
// same place, or places that are near each other, wherever in the world it is.
// ============================================================================
import { DESTINATIONS, findDestination, type Destination } from "./catalog";

export type Place = {
  key: string; // "joshua-tree" or "geo:5391811"
  name: string; // "San Diego"
  country?: string; // "United States"
  region?: string; // state/province, e.g. "California" (searched places only)
  lat: number;
  lon: number;
};

export const LA = { lat: 34.0522, lon: -118.2437 };

export const catalogPlace = (d: Destination): Place => ({ key: d.id, name: d.name, country: d.country, lat: d.lat, lon: d.lon });
export const CATALOG_PLACES: Place[] = DESTINATIONS.map(catalogPlace);

// Straight-line distance between two points on Earth, in kilometres.
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// "San Diego, California" / "Kyoto, Japan" — for cards and lists.
export function placeLabel(p: Place): string {
  if (findDestination(p.key)) return p.name;
  const where = p.country === "United States" ? p.region : p.country;
  return where ? `${p.name}, ${where}` : p.name;
}

// Older saved data (and proposal snapshots) stored destinations as plain
// catalog ids like "joshua-tree". This turns either shape into Places.
export function toPlaces(raw: unknown): Place[] {
  if (!Array.isArray(raw)) return [];
  const out: Place[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const d = findDestination(item);
      out.push(d ? catalogPlace(d) : { key: `name:${item}`, name: item, lat: NaN, lon: NaN });
    } else if (item && typeof item === "object" && typeof (item as Place).key === "string") {
      out.push(item as Place);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Turn a place into the trip details the cost estimate and outline need.
// Quick picks have hand-written details; any other city gets sensible
// defaults based on how far it is from LA (drive under ~500 km, else fly).
// ---------------------------------------------------------------------------
export function resolveDestination(p: Place): Destination {
  const known = findDestination(p.key);
  if (known) return known;
  const km = Number.isFinite(p.lat) ? distanceKm(LA, p) : 3000;
  const roadMiles = Math.round((km * 1.25) / 1.609); // roads are longer than straight lines
  const fly = km > 500;
  // Rough round-trip flight ranges by distance (estimates, not quotes).
  const flight: [number, number] = km < 1500 ? [120, 300] : km < 4500 ? [250, 600] : km < 9000 ? [600, 1300] : [900, 1800];
  return {
    id: p.key,
    name: p.name,
    country: p.country ?? "",
    lat: p.lat,
    lon: p.lon,
    region: fly ? "fly-far" : "socal-coast",
    access: fly ? "fly" : "drive",
    milesFromLA: roadMiles,
    flight: fly ? flight : undefined,
    lodging: "mid",
    activities: [20, 120],
    vibes: [],
    ideas: [`Explore central ${p.name}`, "Local food and markets", "A day trip nearby", "Free morning, then wander"],
    gear: [],
  };
}

// ---------------------------------------------------------------------------
// World city search (Open-Meteo geocoding: free, no key, global).
// Used from the browser on the plan form.
// ---------------------------------------------------------------------------
type GeoResult = { id: number; name: string; latitude: number; longitude: number; country?: string; admin1?: string; feature_code?: string };

export async function searchCities(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: "8", language: "en", format: "json" })}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("City search is unavailable right now.");
  const data = (await res.json()) as { results?: GeoResult[] };
  // Prefer cities and towns (GeoNames feature codes starting "PPL"); fall back to
  // anything (islands, parks, regions) only when no city matches.
  const all = data.results ?? [];
  const cities = all.filter((r) => r.feature_code?.startsWith("PPL"));
  return (cities.length ? cities : all).slice(0, 6).map((r) => ({
    key: `geo:${r.id}`,
    name: r.name,
    country: r.country,
    region: r.admin1,
    lat: Math.round(r.latitude * 1e4) / 1e4,
    lon: Math.round(r.longitude * 1e4) / 1e4,
  }));
}

// Opens Google Maps in a new tab, searching for the place by name.
export const mapUrl = (p: Place) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.country && !placeLabel(p).includes(p.country) ? `${placeLabel(p)}, ${p.country}` : placeLabel(p))}`;
