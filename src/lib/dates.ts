// ============================================================================
// dates.ts — small date helpers.
//
// Why not use JavaScript Date objects everywhere? Time zones. A trip on
// "Nov 21" should be Nov 21 for everyone, so we store plain "YYYY-MM-DD"
// strings and do math on whole day numbers (days since 1970-01-01, in UTC).
// ============================================================================
import type { DateRange } from "./types";

const MS_PER_DAY = 86_400_000;

// "2026-11-21" -> 20778 (a whole number of days). Easy to add and compare.
export function toDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

// 20778 -> "2026-11-21"
export function fromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export const addDays = (iso: string, n: number) => fromDay(toDay(iso) + n);

// Number of calendar days in a range, counting both ends (Nov 21–24 = 4 days).
export const daysInclusive = (r: DateRange) => toDay(r.end) - toDay(r.start) + 1;

export const isIsoDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromDay(toDay(s)) === s;

// The overlap of two ranges, or null if they don't touch.
export function intersect(a: DateRange, b: DateRange): DateRange | null {
  const start = Math.max(toDay(a.start), toDay(b.start));
  const end = Math.min(toDay(a.end), toDay(b.end));
  return end >= start ? { start: fromDay(start), end: fromDay(end) } : null;
}

// Every overlap between two lists of ranges (used when someone picks several weekends).
export function intersectLists(a: DateRange[], b: DateRange[]): DateRange[] {
  const out: DateRange[] = [];
  for (const x of a) for (const y of b) {
    const i = intersect(x, y);
    if (i) out.push(i);
  }
  return out;
}

// Today's date in Los Angeles, as YYYY-MM-DD. All students are at USC.
export function todayLA(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

// Fridays from the next upcoming Friday through `horizonDays` from today.
// Used for the "pick weekends" option.
export function upcomingFridays(today: string, horizonDays: number): string[] {
  const t = toDay(today);
  // 1970-01-01 was a Thursday, so (day + 4) % 7 gives 0 = Sunday ... 5 = Friday.
  const weekday = (t + 4) % 7;
  let friday = t + ((5 - weekday + 7) % 7 || 7); // next Friday, never today
  const out: string[] = [];
  while (friday <= t + horizonDays) {
    out.push(fromDay(friday));
    friday += 7;
  }
  return out;
}

export const isFriday = (iso: string) => (toDay(iso) + 4) % 7 === 5;

// --- Formatting for people ---------------------------------------------------
const monthDay = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// "Nov 21–24", "Nov 29 – Dec 2", or "Nov 21" for a single day.
export function formatRange(r: DateRange): string {
  if (r.start === r.end) return monthDay(r.start);
  const [sy, sm] = r.start.split("-");
  const [ey, em] = r.end.split("-");
  if (sy === ey && sm === em) return `${monthDay(r.start)}–${Number(r.end.slice(8))}`;
  return `${monthDay(r.start)} – ${monthDay(r.end)}`;
}

export const formatDate = monthDay;

export function formatWeekday(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
