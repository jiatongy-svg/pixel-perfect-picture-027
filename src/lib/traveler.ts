import { z } from "zod";
export const PACE = ["Easygoing", "Balanced", "Packed days"] as const;
export const RHYTHM = ["Early bird", "Flexible", "Night owl"] as const;
export const STAYS = ["Hotel", "Hostel", "Shared rental", "Camping", "Flexible"] as const;
export const TRIP_ITEMS = ["Car", "Tent", "Camera", "First-aid kit", "Cooler", "Hiking gear", "Portable charger", "Board games"];
export const detailsSchema = z.object({
  year: z.enum(["1st year", "2nd year"]).default("1st year"),
  bio: z.string().trim().max(140).default(""),
  pace: z.enum(PACE).default("Balanced"), rhythm: z.enum(RHYTHM).default("Flexible"), stay: z.enum(STAYS).default("Flexible"),
  private_notes: z.string().trim().max(1000).default(""),
  trip_tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  budget_min: z.number().int().min(0).max(100000).optional(), budget_max: z.number().int().min(0).max(100000).optional(),
}).refine((d) => d.budget_min === undefined || d.budget_max === undefined || d.budget_max >= d.budget_min, { message: "Maximum budget must be at least the minimum.", path: ["budget_max"] });
export type TravelerDetails = z.infer<typeof detailsSchema>;
export const DEFAULT_DETAILS: TravelerDetails = { year: "1st year", bio: "", pace: "Balanced", rhythm: "Flexible", stay: "Flexible", private_notes: "", trip_tags: [] };
// Draft money stays as text. Empty fields stay empty, and leading zeros disappear.
export function moneyDraft(value: string) {
  if (!/^\d*$/.test(value)) return null;
  return value.replace(/^0+(?=\d)/, "");
}
export function moneyValue(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n <= 100000 ? n : null;
}
export function mapUrl(destination: string, usOnly = false) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination.trim() + (usOnly ? ", United States" : ""))}`;
}
