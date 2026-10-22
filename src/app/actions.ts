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
import { PLAN_LIMITS } from "@/lib/constants";
import { todayLA } from "@/lib/dates";
import { getViewer, loadPeople, loadProposals, proposalPeople } from "@/lib/data";
import { scoreGroup, scorePair } from "@/lib/matching";
import { mergePlans, type MergedTrip } from "@/lib/merge";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";
import { counterSchema, fieldErrors, planSchema, profileSchema, type PlanInput, type ProfileInput } from "@/lib/validation";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; fields?: Record<string, string>; conflicts?: string[] };

const STALE = "This proposal changed. Refresh to see the latest version.";

// Turn database error codes (raised in schema.sql) into sentences.
function friendlyDbError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (message.includes("STALE_VERSION")) return STALE;
  if (message.includes("NOT_PENDING")) return "This proposal is already closed. Refresh to see its latest status.";
  if (message.includes("NOT_MEMBER")) return "You're not part of this proposal.";
  if (message.includes("NOT_ALLOWED")) return "Everyone on a proposal needs a finished profile and a saved plan.";
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
export async function savePlan(input: PlanInput, planId?: string): Promise<ActionResult> {
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

  // RLS makes sure an update can only touch my own rows.
  const { error } = planId
    ? await supabase.from("travel_plans").update(plan).eq("id", planId).eq("user_id", userId)
    : await supabase.from("travel_plans").insert({ user_id: userId, ...plan });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
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
  if (!/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,3}$/.test(targetKey)) return { ok: false, error: "Invalid match." };
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
// Proposals
// ---------------------------------------------------------------------------
const snapshotsOf = (people: Person[]) => people.map((p) => ({ user_id: p.id, name: p.name, plan: p.plan }));

// Build the merged trip (rules, optionally polished by AI) — or explain why not.
async function buildTrip(people: Person[], overrides?: Parameters<typeof mergePlans>[2]): Promise<{ trip: MergedTrip } | { conflicts: string[] }> {
  const today = todayLA();
  const rules = mergePlans(people, today, overrides);
  if (!rules.feasible) return { conflicts: rules.conflicts };
  if (overrides) return { trip: rules }; // a counter keeps exactly what the person asked for
  return { trip: await tryAiMerge(people, rules, today) };
}

// Propose a trip between one of MY plans and 1–3 classmates' plans.
export async function proposeTrip(myPlanId: string, otherPlanIds: string[]): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  const mineOk = z.string().uuid().safeParse(myPlanId).success;
  const ids = z.array(z.string().uuid()).min(1).max(3).safeParse(otherPlanIds);
  if (!mineOk || !ids.success || ids.data.includes(myPlanId)) return { ok: false, error: "Invalid proposal." };

  // Load the CURRENT plans (as this user — RLS applies).
  const loaded = await loadPeople(supabase, { planIds: [myPlanId, ...ids.data] });
  const me = loaded.find((p) => p.plan.id === myPlanId && p.id === userId);
  const others = ids.data.map((id) => loaded.find((p) => p.plan.id === id));
  if (!me) return { ok: false, error: "Pick one of your own plans." };
  if (others.some((o) => !o)) return { ok: false, error: "A classmate's plan changed or was removed. Refresh and try again." };
  const people = [me, ...(others as Person[])];
  if (new Set(people.map((p) => p.id)).size !== people.length) return { ok: false, error: "Each person can join with only one plan." };

  // Re-check eligibility on the server with the latest data.
  const today = todayLA();
  const eligible = people.length === 2 ? scorePair(me, people[1], today).eligible : scoreGroup(people, today).eligible;
  if (!eligible) {
    const why = mergePlans(people, today);
    return { ok: false, error: "These plans no longer line up.", conflicts: why.feasible ? ["Plans changed since matching. Refresh your matches."] : why.conflicts };
  }

  const built = await buildTrip(people);
  if ("conflicts" in built) return { ok: false, error: "No feasible compromise.", conflicts: built.conflicts };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_proposal", {
    p_actor: userId,
    p_plans: people.map((p) => p.plan.id),
    p_snapshots: snapshotsOf(people),
    p_merged: built.trip,
  });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  const row = (data as { proposal_id: string; created: boolean }[])[0];
  revalidatePath("/", "layout");
  redirect(`/proposals/${row.proposal_id}${row.created ? "" : "?existing=1"}`);
}

export async function acceptProposal(proposalId: string, version: number): Promise<ActionResult> {
  const { supabase } = await getViewer();
  if (!z.string().uuid().safeParse(proposalId).success) return { ok: false, error: "Invalid proposal." };
  const { data, error } = await supabase.rpc("accept_proposal", { p_proposal: proposalId, p_version: version });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: data === "confirmed" ? "Confirmed — everyone's in!" : "Accepted. Waiting on the others." };
}

export async function declineProposal(proposalId: string, version: number): Promise<ActionResult> {
  const { supabase } = await getViewer();
  if (!z.string().uuid().safeParse(proposalId).success) return { ok: false, error: "Invalid proposal." };
  const { error } = await supabase.rpc("decline_proposal", { p_proposal: proposalId, p_version: version });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Declined." };
}

export async function counterProposal(input: z.input<typeof counterSchema>): Promise<ActionResult> {
  const { supabase, userId } = await getViewer();
  const parsed = counterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) };
  const c = parsed.data;

  // RLS only returns this proposal if the user is a member.
  const [proposal] = await loadProposals(supabase, c.proposalId);
  if (!proposal) return { ok: false, error: "You're not part of this proposal." };
  if (proposal.status !== "pending") return { ok: false, error: "This proposal is already closed." };
  if (proposal.current_version !== c.version) return { ok: false, error: STALE };

  // Use the latest version of the plans in this proposal; fixed constraints must still hold.
  const people = await proposalPeople(supabase, proposal);
  if (!people) return { ok: false, error: "A member deleted their plan, so this can't be countered. Decline it instead." };

  const built = await buildTrip(people, { destinationId: c.destinationId, start: c.start, end: c.end });
  if ("conflicts" in built) return { ok: false, error: "That change breaks someone's constraints.", conflicts: built.conflicts };

  const admin = createAdminClient();
  const { error } = await admin.rpc("counter_proposal", {
    p_actor: userId,
    p_proposal: c.proposalId,
    p_expected_version: c.version,
    p_snapshots: snapshotsOf(people),
    p_merged: built.trip,
    p_note: c.note,
  });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: `Sent version ${c.version + 1}. Accept it when you're happy with it.` };
}
