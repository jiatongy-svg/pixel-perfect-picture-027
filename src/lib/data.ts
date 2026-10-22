// ============================================================================
// data.ts — server-side data loading. Every query here runs AS the signed-in
// user (RLS applies), so it can only ever see what that user is allowed to.
// ============================================================================
import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toPlaces } from "@/lib/places";
import type { Person, Plan, Profile, PublicPlan } from "@/lib/types";
import type { MergedTrip } from "@/lib/merge";

export type Supabase = Awaited<ReturnType<typeof createClient>>;

// The plan columns classmates may see (matches the plan_cards view).
export const PUBLIC_PLAN_COLUMNS =
  "id, user_id, timing_mode, break_id, date_mode, preferred_start, preferred_end, flex_days, weekends, trip_length_min, trip_length_max, destinations, destination_flex, budget_min, budget_max, vibes, bringing_car, seats_offered, bringing_gear, updated_at";

// ---------------------------------------------------------------------------
// Who is signed in? Redirects away if nobody is, or if they're not on the list.
// ---------------------------------------------------------------------------
export async function getViewer() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/signin");

  // Double-check the allowlist on every page (someone could be removed mid-pilot).
  const { data: allowed } = await supabase.rpc("is_allowlisted");
  if (!allowed) redirect("/auth/signout?reason=private");

  const [{ data: profile }, { data: plans }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle(),
    supabase.from("travel_plans").select("*").eq("user_id", data.user.id).order("updated_at", { ascending: false }),
  ]);
  const mine = ((plans ?? []) as Plan[]).map((p) => ({ ...p, destinations: toPlaces(p.destinations) }));
  return { supabase, userId: data.user.id, profile: profile as Profile | null, plans: mine };
}

// Pages that need a finished profile send new users to onboarding first.
export async function getOnboardedViewer() {
  const v = await getViewer();
  if (!v.profile?.completed) redirect("/onboarding");
  return v as typeof v & { profile: Profile };
}

export function toPerson(profile: Profile, plan: PublicPlan): Person {
  return {
    id: profile.id,
    name: profile.display_name,
    msbaYear: profile.msba_year,
    profile: {
      has_car: profile.has_car,
      car_seats: profile.car_seats,
      equipment: profile.equipment,
      travel_experience: profile.travel_experience,
      pace: profile.pace,
      schedule: profile.schedule,
      lodging_prefs: profile.lodging_prefs,
      bio: profile.bio,
      photo_path: profile.photo_path,
      mbti: profile.mbti ?? null,
    },
    plan: { ...plan, destinations: toPlaces(plan.destinations) },
  };
}

// One entry per (student, plan) for everyone with a completed profile —
// including the viewer's own plans. Optionally only some users or some plans.
// Only real allowlisted users exist in this database — there are no demo users.
export async function loadPeople(supabase: Supabase, only?: { userIds?: string[]; planIds?: string[] }) {
  let profilesQ = supabase.from("profiles").select("*").eq("completed", true);
  let plansQ = supabase.from("plan_cards").select(PUBLIC_PLAN_COLUMNS).order("updated_at", { ascending: false });
  if (only?.userIds) {
    profilesQ = profilesQ.in("id", only.userIds);
    plansQ = plansQ.in("user_id", only.userIds);
  }
  if (only?.planIds) plansQ = plansQ.in("id", only.planIds);
  const [{ data: profiles, error: e1 }, { data: plans, error: e2 }] = await Promise.all([profilesQ, plansQ]);
  if (e1 || e2) throw new Error("Couldn't load classmates' plans.");
  const profileBy = new Map((profiles as Profile[]).map((p) => [p.id, p]));
  return (plans as PublicPlan[]).filter((pl) => profileBy.has(pl.user_id)).map((pl) => toPerson(profileBy.get(pl.user_id)!, pl));
}

// A plan's display name: its own title, or "Thanksgiving · Joshua Tree".
export function planName(plan: Pick<Plan, "title" | "timing_mode" | "break_id" | "destinations">): string {
  if (plan.title?.trim()) return plan.title.trim();
  const when = plan.timing_mode === "weekends" ? "Weekends" : BREAK_SHORT[plan.break_id ?? ""] ?? "Break";
  const where = toPlaces(plan.destinations)[0]?.name ?? "Anywhere";
  return `${when} · ${where}`;
}
const BREAK_SHORT: Record<string, string> = { thanksgiving: "Thanksgiving", winter: "Winter break", spring: "Spring break" };

// Short-lived signed URLs for profile photos (the bucket is private).
export async function photoUrls(supabase: Supabase, paths: (string | null)[]): Promise<Record<string, string>> {
  const real = [...new Set(paths.filter((p): p is string => !!p))];
  if (!real.length) return {};
  const { data } = await supabase.storage.from("avatars").createSignedUrls(real, 60 * 60);
  const out: Record<string, string> = {};
  for (const item of data ?? []) if (item.signedUrl && item.path) out[item.path] = item.signedUrl;
  return out;
}

export async function pilotStats(supabase: Supabase) {
  const { data } = await supabase.rpc("pilot_stats");
  const row = (data as { total: number; joined: number; open: boolean }[] | null)?.[0];
  return row ?? { total: 0, joined: 0, open: false };
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------
export type ProposalRow = {
  id: string;
  member_key: string;
  size: number;
  status: "pending" | "confirmed" | "declined" | "superseded";
  current_version: number;
  created_by: string;
  declined_by: string | null;
  created_at: string;
  updated_at: string;
};
export type VersionRow = {
  proposal_id: string;
  version: number;
  snapshots: Snapshot[];
  merged: MergedTrip;
  note: string;
  created_by: string;
  created_at: string;
};
export type Snapshot = { user_id: string; name: string; plan: PublicPlan };

// Proposals the viewer belongs to (RLS returns only those), newest first,
// with member names, the current version, and who has accepted it.
export async function loadProposals(supabase: Supabase, onlyId?: string) {
  let q = supabase.from("proposals").select("*").order("updated_at", { ascending: false });
  if (onlyId) q = q.eq("id", onlyId);
  const { data: proposals, error } = await q;
  if (error) throw new Error("Couldn't load proposals.");
  const rows = (proposals ?? []) as ProposalRow[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);

  const [{ data: members }, { data: versions }, { data: approvals }] = await Promise.all([
    supabase.from("proposal_members").select("proposal_id, user_id").in("proposal_id", ids),
    supabase.from("proposal_versions").select("*").in("proposal_id", ids).order("version", { ascending: true }),
    supabase.from("proposal_approvals").select("proposal_id, version, user_id, created_at").in("proposal_id", ids),
  ]);
  const memberIds = [...new Set((members ?? []).map((m) => m.user_id as string))];
  const { data: profiles } = await supabase.from("profiles").select("id, display_name, msba_year, photo_path").in("id", memberIds);
  const profileBy = new Map((profiles ?? []).map((p) => [p.id as string, p as Pick<Profile, "id" | "display_name" | "msba_year" | "photo_path">]));

  return rows.map((r) => {
    const vs = ((versions ?? []) as VersionRow[]).filter((v) => v.proposal_id === r.id);
    const current = vs.find((v) => v.version === r.current_version)!;
    const accepted = new Set((approvals ?? []).filter((a) => a.proposal_id === r.id && a.version === r.current_version).map((a) => a.user_id as string));
    const people = (members ?? [])
      .filter((m) => m.proposal_id === r.id)
      .map((m) => ({ ...(profileBy.get(m.user_id) ?? { id: m.user_id, display_name: "Classmate", msba_year: "1st" as const, photo_path: null }), accepted: accepted.has(m.user_id) }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
    return { ...r, versions: vs, current, people };
  });
}
export type LoadedProposal = Awaited<ReturnType<typeof loadProposals>>[number];

// The plans a proposal is about, as they are NOW (for countering). The plan ids
// come from the current version's snapshots; proposals made before students
// could have several plans fall back to each member's most recent plan.
// Returns null if any of those plans was deleted.
export async function proposalPeople(supabase: Supabase, p: LoadedProposal): Promise<Person[] | null> {
  const planIds = p.current.snapshots.map((s) => s.plan?.id).filter((x): x is string => !!x);
  if (planIds.length === p.people.length) {
    const found = await loadPeople(supabase, { planIds });
    return found.length === planIds.length ? found : null;
  }
  const byUser = await loadPeople(supabase, { userIds: p.people.map((m) => m.id) });
  const firstEach = p.people.map((m) => byUser.find((x) => x.id === m.id));
  return firstEach.every(Boolean) ? (firstEach as Person[]) : null;
}
