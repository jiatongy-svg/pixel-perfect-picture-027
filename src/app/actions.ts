"use server";
// ============================================================================
// actions.ts — every button that changes data calls one of these Server
// Actions. They run on the server only.
//
// Pattern for each action:
//   1. Find out who is signed in (never trust an id sent from the browser).
//   2. Validate the input.
//   3. Write to the database as that user (RLS applies), or — for creating /
//      countering proposals — through a locked-down database function.
//   4. Return { ok: true } or a friendly error the form can show.
// ============================================================================
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { tryAiMerge } from "@/lib/ai-merge";
import { PLAN_LIMITS, TRIPS } from "@/lib/constants";
import { todayLA } from "@/lib/dates";
import { getViewer, loadPeople, loadProposals, proposalPeople } from "@/lib/data";
import { tripKind } from "@/lib/matching";
import { mergePlans, type MergedTrip } from "@/lib/merge";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";
import { fieldErrors, finalPlanSchema, hostSchema, planSchema, profileSchema, type PlanInput, type ProfileInput } from "@/lib/validation";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; fields?: Record<string, string>; conflicts?: string[] };

const STALE = "This trip changed. Refresh to see the latest version.";

// Turn database error codes (raised in schema.sql) into sentences.
function friendlyDbError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (message.includes("STALE_VERSION")) return STALE;
  if (message.includes("NOT_PENDING")) return "This trip is already settled. Refresh to see its latest status.";
  if (message.includes("NOT_MEMBER")) return "You're not part of this trip.";
  if (message.includes("GROUP_SIZE_STRICT")) return "Joining would make this group bigger than your strict group-size limit. You can change it on your profile.";
  if (message.includes("ALREADY_BOOKED")) return "Someone's plan for this trip is already booked in another confirmed trip, so this one can't be confirmed.";
  if (message.includes("FULL")) return "This trip just filled up.";
  if (message.includes("NOT_OPEN")) return "Sign-ups for this trip are closed.";
  if (message.includes("not everyone is interested")) return "Not everyone is interested yet.";
  if (message.includes("BAD_INPUT")) return "That trip is no longer available. Refresh and try again.";
  if (message.includes("NOT_ALLOWED")) return "Everyone needs a finished profile first.";
  if (message.includes("check constraint")) return "Some answers aren't valid. Please review the form.";
  if (message.includes("TOO_MANY_PLANS")) return "You can save up to 5 plans. Delete one to add another.";
  return "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// Sign in with a one-time code / magic link
// ---------------------------------------------------------------------------
const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);

// The address this site is being visited at (localhost or the Vercel URL), so
// nothing needs configuring. Supabase only accepts it if it's in Auth ->
// URL Configuration -> Redirect URLs, so a faked Host header can't misuse it.
async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function sendSignInEmail(rawEmail: string): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  // Check access BEFORE sending anything: the email must be on the allowlist,
  // or its domain must be open (e.g. every @usc.edu address). Anyone else gets
  // the "private" message and no email or account is created.
  const admin = createAdminClient();
  const { data: allowed, error: checkErr } = await admin.rpc("email_allowed", { p_email: parsed.data });
  if (checkErr) {
    // Log only the error type (never the email) so it shows in Vercel -> Logs.
    console.error("email_allowed check failed:", checkErr.code, checkErr.message);
    return { ok: false, error: "We couldn't check your email. Please try again in a moment." };
  }
  if (!allowed) return { ok: false, error: "PRIVATE" };

  // First time here? Create the account now (already confirmed). Otherwise
  // Supabase would send its "Confirm your email" sign-UP email, which has only
  // a link — and USC's mail scanner uses that link up before the student can.
  // This way every student always gets the sign-IN email with a 6-digit code.
  const { error: createErr } = await admin.auth.admin.createUser({ email: parsed.data, email_confirm: true });
  if (createErr && createErr.code !== "email_exists" && !/already/i.test(createErr.message)) {
    console.error("createUser failed:", createErr.code, createErr.message);
    return { ok: false, error: "We couldn't set up your account. Please try again in a moment." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: false, // the account was just made above
      emailRedirectTo: `${await siteOrigin()}/auth/confirm`,
    },
  });
  if (error) {
    console.error("signInWithOtp failed:", error.code, error.message);
    const msg = `${error.code ?? ""} ${error.message}`.toLowerCase();
    if (msg.includes("rate") || error.status === 429) return { ok: false, error: "Too many sign-in emails. Wait a minute, then try again." };
    if (msg.includes("signup") || msg.includes("otp_disabled") || msg.includes("not found") || error.status === 422)
      return { ok: false, error: "PRIVATE" };
    return { ok: false, error: "We couldn't send the email. Please try again in a moment." };
  }
  return { ok: true };
}

export async function verifySignInCode(rawEmail: string, rawCode: string): Promise<ActionResult> {
  const email = emailSchema.safeParse(rawEmail);
  const code = z.string().trim().regex(/^\d{6,8}$/, "Enter the code from the email").safeParse(rawCode);
  if (!email.success || !code.success) return { ok: false, error: "Enter the code from the email" };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: "email" });
  if (error) {
    // Log only the reason (never the email or code) so it shows in Vercel -> Logs.
    console.error("verifyOtp failed:", error.code, error.message);
    const expired = error.code === "otp_expired" || /expired|invalid/i.test(error.message);
    return { ok: false, error: expired ? "That code is wrong or expired. Use the code from the newest email, or tap Resend." : "That code didn't work. Please try again." };
  }
  const { data: allowed } = await supabase.rpc("is_allowlisted");
  if (!allowed) {
    await supabase.auth.signOut();
    return { ok: false, error: "PRIVATE" };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/signin");
}

// ---------------------------------------------------------------------------
// Profile and plan
// ---------------------------------------------------------------------------
export async function saveProfile(input: ProfileInput): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) };
  // A photo path must point inside the user's own folder.
  if (parsed.data.photo_path && !parsed.data.photo_path.startsWith(`${userId}/`))
    return { ok: false, error: "That photo upload didn't work. Try again.", fields: { photo_path: "Upload failed" } };

  const { error } = await supabase.from("profiles").upsert({ id: userId, ...parsed.data, completed: true });
  if (error) return { ok: false, error: friendlyDbError(error.message) };

  // If they removed gear or their car, quietly drop it from their plans too.
  const { data: plans } = await supabase.from("travel_plans").select("id, bringing_gear, bringing_car, seats_offered").eq("user_id", userId);
  for (const plan of plans ?? []) {
    const gear = (plan.bringing_gear as string[]).filter((g) => (parsed.data.equipment as string[]).includes(g));
    const car = plan.bringing_car && parsed.data.has_car;
    await supabase
      .from("travel_plans")
      .update({ bringing_gear: gear, bringing_car: car, seats_offered: car ? Math.min(plan.seats_offered, parsed.data.car_seats) : 0 })
      .eq("id", plan.id);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved" };
}

// Create a new plan (no planId) or update one of my plans (planId).
// `publish`: also post it to Discover now with this many open spots.
export async function savePlan(input: PlanInput, planId?: string, publish?: { spots: number; joinDeadline: string | null }): Promise<ActionResult> {
  const { supabase, userId, profile, plans } = await getViewer();
  if (planId && !plans.some((p) => p.id === planId)) return { ok: false, error: "That plan isn't yours or was deleted." };
  if (!planId && plans.length >= PLAN_LIMITS.maxPlans) return { ok: false, error: `You can save up to ${PLAN_LIMITS.maxPlans} plans. Delete one to add another.` };
  if (!profile?.completed) return { ok: false, error: "Finish your travel profile first." };
  const parsed = planSchema(todayLA()).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) };
  const plan = parsed.data;

  // You can only bring what's on your profile.
  if (plan.bringing_car && !profile.has_car) return { ok: false, error: "Add your car to your profile first.", fields: { bringing_car: "No car on your profile" } };
  if (plan.seats_offered > profile.car_seats) return { ok: false, error: "Please fix the highlighted fields.", fields: { seats_offered: `Your profile says ${profile.car_seats} passenger seats` } };
  if (plan.bringing_gear.some((g) => !profile.equipment.includes(g)))
    return { ok: false, error: "Please fix the highlighted fields.", fields: { bringing_gear: "Only gear from your profile" } };
  if (plan.willing_to_drive && !profile.has_license)
    return { ok: false, error: "Add your driver's license to your profile first.", fields: { willing_to_drive: "No license on your profile" } };

  // RLS makes sure an update can only touch my own rows.
  // Editing a plan restarts its 24-hour match window.
  const { data: saved, error } = planId
    ? await supabase.from("travel_plans").update({ ...plan, status: "active", searching_since: new Date().toISOString() }).eq("id", planId).eq("user_id", userId).select("id").single()
    : await supabase.from("travel_plans").insert({ user_id: userId, ...plan }).select("id").single();
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
  // "I'm going no matter what": publish it to Discover right away.
  if (publish) return hostTrip({ planId: saved.id as string, spots: publish.spots, joinDeadline: publish.joinDeadline });
  return { ok: true, message: "Plan saved" };
}

export async function deletePlan(planId: string): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  if (!z.string().uuid().safeParse(planId).success) return { ok: false, error: "Invalid plan." };
  const { error } = await supabase.from("travel_plans").delete().eq("id", planId).eq("user_id", userId);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
  redirect("/plans?deleted=1");
}

// ---------------------------------------------------------------------------
// Pass on a match (hides it for you only)
// ---------------------------------------------------------------------------
export async function passMatch(targetKey: string): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  if (!/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,5}$/.test(targetKey)) return { ok: false, error: "Invalid match." };
  const { error } = await supabase.from("match_passes").upsert({ user_id: userId, target_key: targetKey }, { ignoreDuplicates: true });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/matches");
  return { ok: true };
}

export async function clearPasses(): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  const { error } = await supabase.from("match_passes").delete().eq("user_id", userId);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/matches");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Trips: interest -> group chat -> final plan -> confirmed (-> Discover)
// ---------------------------------------------------------------------------
const snapshotsOf = (people: Person[]) => people.map((p) => ({ user_id: p.id, name: p.name, plan: p.plan }));
const planKeyRe = /^[0-9a-f-]{36}(,[0-9a-f-]{36}){1,5}$/;

// Build the merged trip (rules, optionally polished by AI) — or explain why not.
async function buildTrip(people: Person[], overrides?: Parameters<typeof mergePlans>[2]): Promise<{ trip: MergedTrip } | { conflicts: string[] }> {
  const today = todayLA();
  const rules = mergePlans(people, today, overrides);
  if (!rules.feasible) return { conflicts: rules.conflicts };
  if (overrides) return { trip: rules }; // the group's own choices are kept exactly
  return { trip: await tryAiMerge(people, rules, today) };
}

// Tap "Interested" on a potential trip (a set of plans incl. one of mine).
// When everyone in it has tapped, the group chat opens with a suggested itinerary.
export async function expressInterest(planKey: string): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  if (!planKeyRe.test(planKey)) return { ok: false, error: "Invalid match." };
  const { data, error } = await supabase.rpc("express_interest", { p_plan_key: planKey });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  const r = (data as { mutual: boolean; interested: number; needed: number }[])[0];
  revalidatePath("/matches");
  if (!r.mutual) return { ok: true, message: `You're interested (${r.interested} of ${r.needed}). The group chat opens when everyone is.` };

  // Everyone's in: suggest an itinerary from their CURRENT plans and open the chat.
  const people = await loadPeople(supabase, { planIds: planKey.split(",") });
  const me = people.find((p) => p.id === userId);
  if (!me || people.length !== planKey.split(",").length) return { ok: false, error: "A plan changed or was removed. Refresh your matches." };
  const ordered = [me, ...people.filter((p) => p !== me)];
  const built = await buildTrip(ordered);
  const suggestion = "trip" in built ? built.trip : null;
  const kind = tripKind(suggestion?.dates ?? null, ordered.map((p) => p.plan));
  const { data: started, error: e2 } = await createAdminClient().rpc("start_trip", {
    p_actor: userId,
    p_plan_key: planKey,
    p_kind: kind,
    p_snapshots: snapshotsOf(ordered),
    p_merged: suggestion ?? { summary: "No automatic suggestion — work out the dates and place in the chat." },
  });
  if (e2) return { ok: false, error: friendlyDbError(e2.message) };
  revalidatePath("/", "layout");
  redirect(`/trips/${(started as { proposal_id: string }[])[0].proposal_id}?new=1`);
}

export async function withdrawInterest(planKey: string): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  if (!planKeyRe.test(planKey)) return { ok: false, error: "Invalid match." };
  await supabase.from("match_interests").delete().eq("user_id", userId).eq("plan_key", planKey);
  revalidatePath("/matches");
  return { ok: true };
}

// ---- Chat ------------------------------------------------------------------
export type ChatMessage = { id: number; userId: string; name: string; body: string; at: string; mine: boolean };

export async function getMessages(proposalId: string, afterId = 0): Promise<ChatMessage[]> {
  const { supabase, userId } = await getViewer();
  if (!z.string().uuid().safeParse(proposalId).success) return [];
  // RLS returns messages only to members of this trip.
  const { data } = await supabase
    .from("trip_messages")
    .select("id, user_id, body, created_at")
    .eq("proposal_id", proposalId)
    .gt("id", afterId)
    .order("id", { ascending: true })
    .limit(200);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id as string))];
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  const nameBy = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
  return rows.map((r) => ({ id: r.id as number, userId: r.user_id as string, name: nameBy.get(r.user_id) ?? "Classmate", body: r.body as string, at: r.created_at as string, mine: r.user_id === userId }));
}

export async function sendMessage(proposalId: string, body: string): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  const text = body.trim();
  if (!z.string().uuid().safeParse(proposalId).success || !text) return { ok: false, error: "Type a message first." };
  if (text.length > TRIPS.maxMessage) return { ok: false, error: `Keep messages under ${TRIPS.maxMessage} characters.` };
  const { error } = await supabase.from("trip_messages").insert({ proposal_id: proposalId, user_id: userId, body: text });
  if (error) return { ok: false, error: "Couldn't send. You may no longer be in this trip." };
  return { ok: true };
}

// ---- Final plan (the checklist survey) --------------------------------------
export async function submitFinalPlan(input: z.input<typeof finalPlanSchema>): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  const parsed = finalPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) };
  const f = parsed.data;

  const [proposal] = await loadProposals(supabase, f.proposalId); // members only (RLS)
  if (!proposal) return { ok: false, error: "You're not part of this trip." };
  if (proposal.status !== "pending") return { ok: false, error: "This trip is already settled." };
  if (proposal.current_version !== f.version) return { ok: false, error: STALE };

  // The final dates and place must still fit everyone's plans (fixed dates stay fixed).
  const people = await proposalPeople(supabase, proposal);
  if (!people) return { ok: false, error: "A member deleted their plan. Start a new match instead." };
  const built = await buildTrip(people, { destinationId: f.destinationId, start: f.start, end: f.end });
  if ("conflicts" in built) return { ok: false, error: "That plan breaks someone's constraints.", conflicts: built.conflicts };

  // Sign-ups close at the chosen date, or 48 hours before the trip by default.
  const deadline = f.wantMore ? deadlineIso(f.joinDeadline, f.start) : null;
  const merged = { ...built.trip, meta: { final: true, wantMore: f.wantMore, extraSpots: f.wantMore ? f.extraSpots : 0, joinDeadline: deadline } };
  const { error } = await createAdminClient().rpc("submit_final_plan", {
    p_actor: userId,
    p_proposal: f.proposalId,
    p_expected_version: f.version,
    p_snapshots: snapshotsOf(people),
    p_merged: merged,
    p_note: f.note,
  });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Final plan sent. It's set once everyone accepts it." };
}

// End of the chosen day in LA, or 48h before the trip starts.
function deadlineIso(day: string | null, tripStart: string): string {
  if (day) return new Date(`${day}T23:59:00-08:00`).toISOString();
  const start = new Date(`${tripStart}T08:00:00-08:00`).getTime();
  return new Date(start - TRIPS.defaultDeadlineHoursBefore * 3600_000).toISOString();
}

export async function acceptProposal(proposalId: string, version: number): Promise<ActionResult> {
  const { supabase } = await getViewer();
  if (!z.string().uuid().safeParse(proposalId).success) return { ok: false, error: "Invalid trip." };
  const { data, error } = await supabase.rpc("accept_proposal", { p_proposal: proposalId, p_version: version });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: data === "confirmed" ? "Confirmed — everyone's in!" : "Accepted. Waiting on the others." };
}

// ---- Join / leave / stay -------------------------------------------------
export async function joinTrip(proposalId: string): Promise<ActionResult> {
  const { supabase } = await getViewer();
  if (!z.string().uuid().safeParse(proposalId).success) return { ok: false, error: "Invalid trip." };
  const { error } = await supabase.rpc("join_trip", { p_proposal: proposalId });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
  redirect(`/trips/${proposalId}?joined=1`);
}

// One tap (after a confirm step in the UI). Frees the spot. For a match still
// being worked out, leaving ends it ("match failed").
export async function leaveTrip(proposalId: string): Promise<ActionResult> {
  const { supabase } = await getViewer();
  if (!z.string().uuid().safeParse(proposalId).success) return { ok: false, error: "Invalid trip." };
  const { data, error } = await supabase.rpc("leave_trip", { p_proposal: proposalId });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
  redirect(`/trips?left=${data === "declined" ? "ended" : "1"}`);
}

export async function stayInTrip(proposalId: string): Promise<ActionResult> {
  const { supabase } = await getViewer();
  if (!z.string().uuid().safeParse(proposalId).success) return { ok: false, error: "Invalid trip." };
  await supabase.rpc("ack_group_size", { p_proposal: proposalId });
  revalidatePath("/", "layout");
  return { ok: true, message: "Got it — you're staying." };
}

// ---- Publish straight to Discover ("going no matter what" / "Still go") ----
export async function hostTrip(input: z.input<typeof hostSchema>): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  const parsed = hostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) };
  const h = parsed.data;
  const [me] = await loadPeople(supabase, { planIds: [h.planId] });
  if (!me || me.id !== userId) return { ok: false, error: "Pick one of your own plans." };
  if (!me.plan.destinations.length) return { ok: false, error: "Add a destination to this plan first — people join a specific trip.", fields: { destinations: "Add a destination" } };
  const built = await buildTrip([me]);
  if ("conflicts" in built) return { ok: false, error: "This plan's dates have passed or don't work.", conflicts: built.conflicts };
  const { data, error } = await createAdminClient().rpc("host_trip", {
    p_actor: userId,
    p_plan: h.planId,
    p_kind: tripKind(built.trip.dates, [me.plan]),
    p_snapshots: snapshotsOf([me]),
    p_merged: { ...built.trip, meta: { final: true, wantMore: true, extraSpots: h.spots, joinDeadline: deadlineIso(h.joinDeadline, built.trip.dates.start) } },
    p_capacity: Math.min(TRIPS.maxTripSize, 1 + h.spots),
    p_deadline: deadlineIso(h.joinDeadline, built.trip.dates.start),
  });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
  redirect(`/trips/${data as string}?published=1`);
}

// ---- The 24-hour "no match yet" window ------------------------------------
// End: close the request (the plan stops being matched; it can be reopened).
export async function endPlanSearch(planId: string): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  if (!z.string().uuid().safeParse(planId).success) return { ok: false, error: "Invalid plan." };
  await supabase.from("travel_plans").update({ status: "ended" }).eq("id", planId).eq("user_id", userId);
  revalidatePath("/", "layout");
  return { ok: true, message: "Closed. Want to propose a new plan?" };
}

// Keep looking for another 24 hours (also reopens an ended plan).
export async function restartPlanSearch(planId: string): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  if (!z.string().uuid().safeParse(planId).success) return { ok: false, error: "Invalid plan." };
  await supabase.from("travel_plans").update({ status: "active", searching_since: new Date().toISOString() }).eq("id", planId).eq("user_id", userId);
  revalidatePath("/", "layout");
  return { ok: true, message: "We'll keep looking for another 24 hours." };
}

// ---- Contact line shown to confirmed trip-mates ---------------------------
export async function saveContact(contact: string): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  const text = contact.trim();
  if (text.length > 80) return { ok: false, error: "Keep it under 80 characters." };
  const { error } = await supabase.from("contacts").upsert({ user_id: userId, contact: text });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/profile");
  return { ok: true, message: "Contact saved" };
}
