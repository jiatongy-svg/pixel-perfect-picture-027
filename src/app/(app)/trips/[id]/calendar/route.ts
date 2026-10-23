// Download a confirmed trip as a calendar file (.ics), all-day for each day.
// Works with Google Calendar, Apple Calendar and Outlook.
import { NextResponse, type NextRequest } from "next/server";
import { addDays } from "@/lib/dates";
import type { MergedTrip } from "@/lib/merge";
import { createClient } from "@/lib/supabase/server";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const ymd = (iso: string) => iso.replaceAll("-", "");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  // RLS: only members can read a confirmed itinerary.
  const { data } = await supabase.from("confirmed_itineraries").select("merged").eq("proposal_id", id).maybeSingle();
  const trip = data?.merged as MergedTrip | undefined;
  if (!trip?.dates) return new NextResponse("Not found", { status: 404 });

  const outline = (trip.outline ?? []).map((d) => `${d.date}: ${d.title}`).join("\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TripMatch//USC MSBA//EN",
    "BEGIN:VEVENT",
    `UID:${id}@tripmatch`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${ymd(trip.dates.start)}`,
    `DTEND;VALUE=DATE:${ymd(addDays(trip.dates.end, 1))}`, // all-day events end the day after
    `SUMMARY:${esc(`TripMatch: ${trip.destination?.name ?? "Trip"}`)}`,
    `DESCRIPTION:${esc(`${trip.summary}\n\n${outline}\n\nCosts are estimates, not quotes.`)}`,
    `LOCATION:${esc(trip.destination?.name ?? "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return new NextResponse(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="tripmatch-${id.slice(0, 8)}.ics"` },
  });
}
