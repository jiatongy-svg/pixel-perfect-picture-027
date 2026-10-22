import type { MergedPlan, TripProfile } from "./trip-data";
import type { buildItinerary } from "./matching";
export type TripData = { status: string; viewerId: string | undefined; acceptedBy: string[]; merged: MergedPlan; travelers: TripProfile[]; itinerary: ReturnType<typeof buildItinerary>; isDemo?: boolean };
export function readDemoTrip(id: string): TripData | null {
  try {
    const value = JSON.parse(localStorage.getItem(`tm_demo_trip_${id}`) ?? "null");
    return value?.isDemo === true && Array.isArray(value.travelers) && value.merged && value.itinerary ? value : null;
  } catch { return null; }
}
export function saveDemoTrip(id: string, data: TripData) {
  localStorage.setItem(`tm_demo_trip_${id}`, JSON.stringify(data));
  const ids: string[] = JSON.parse(localStorage.getItem("tm_demo_trip_ids") ?? "[]");
  localStorage.setItem("tm_demo_trip_ids", JSON.stringify([...new Set([id, ...ids])].slice(0, 50)));
}
export function clearLocalTraveler() {
  Object.keys(localStorage).filter((key) => key.startsWith("tm_")).forEach((key) => localStorage.removeItem(key));
}
