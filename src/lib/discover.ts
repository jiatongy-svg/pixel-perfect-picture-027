// Discover: open trips (published, with spots) and the light, profile-only
// "similar style" signal shown to everyone — including people with no plan.
import { PACE, vibeLabel } from "./catalog";
import { fitsRange, type TripKind } from "./groupsize";
import type { MergedTrip } from "./merge";
import type { GroupPref, Profile } from "./types";

export type TripMemberStyle = { year: string; pace: string; schedule: string; vibes: string[]; experience: string; has_car: boolean; can_drive: boolean };
export type OpenTrip = {
  id: string;
  size: number;
  capacity: number;
  join_deadline: string | null;
  trip_kind: TripKind;
  created_at: string;
  merged: MergedTrip;
  is_member: boolean;
  members: TripMemberStyle[];
};

// Light signal only (no score): what you have in common with the group.
export function styleSignal(me: Pick<Profile, "vibes" | "pace">, members: TripMemberStyle[]): string | null {
  const shared = (me.vibes ?? []).filter((v) => members.some((m) => m.vibes?.includes(v)));
  const samePace = members.filter((m) => m.pace === me.pace).length;
  const bits: string[] = [];
  if (shared.length) bits.push(`you share ${shared.map(vibeLabel).join(", ")}`);
  if (samePace) bits.push(`${samePace === members.length ? "same" : `${samePace} of ${members.length} share your`} ${PACE.find((p) => p.id === me.pace)?.label.toLowerCase() ?? ""} pace`);
  return bits.length ? `Similar style: ${bits.join(" · ")}` : null;
}

// Would joining break my STRICT group-size preference for this kind of trip?
export function strictBlocks(me: Pick<Profile, "group_pref_weekend" | "group_strict_weekend" | "group_pref_long" | "group_strict_long">, trip: Pick<OpenTrip, "size" | "trip_kind">): GroupPref | null {
  const pref = trip.trip_kind === "weekend" ? me.group_pref_weekend : me.group_pref_long;
  const strict = trip.trip_kind === "weekend" ? me.group_strict_weekend : me.group_strict_long;
  return strict && !fitsRange(trip.size + 1, pref) ? pref : null;
}

export const spotsLeft = (t: Pick<OpenTrip, "size" | "capacity">) => Math.max(0, t.capacity - t.size);
