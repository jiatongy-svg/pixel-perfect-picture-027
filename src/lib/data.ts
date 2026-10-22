// ============================================================================
// data.ts — server-side data loading. Every query here runs AS the signed-in
// user (RLS applies), so it can only ever see what that user is allowed to.
// ============================================================================
import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Person, Plan, Profile, PublicPlan } from "@/lib/types";
import type { MergedTrip } from "@/lib/merge";

export type Supabase = Awaited<ReturnType<typeof createClient>>;

// The plan columns classmates may see (matches the plan_cards view).
export const PUBLIC_PLAN_COLUMNS =
  "user_id, timing_mode, break_id, date_mode, preferred_start, preferred_end, flex_days, weekends, trip_length_min, trip_length_max, destinations, destination_flex, budget_min, budget_max, vibes, bringing_car, seats_offered, bringing_gear, updated_at";

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

  const [{ data: profile }, { data: plan }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle(),
    supabase.from("travel_plans").select("*").eq("user_id", data.user.id).maybeSingle(),
  ]);
  return { supabase, userId: data.user.id, profile: profile as Profile | null, plan: plan as Plan | null };
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
    },
    plan,
  };
}

// Everyone with a completed profile AND a saved plan (including the viewer).
// Only real allowlisted users exist in this database — there are no demo users.
export async function loadPeople(supabase: Supabase, onlyIds?: string[]) {
  let profilesQ = supabase.from("profiles").select("*").eq("completed", true);
  let plansQ = supabase.from("plan_cards").select(PUBLIC_PLAN_COLUMNS);
  if (onlyIds) {
    profilesQ = profilesQ.in("id", onlyIds);
    plansQ = plansQ.in("user_id", onlyIds);
  }
  const [{ data: profiles, error: e1 }, { data: plans, error: e2 }] = await Promise.all([profilesQ, plansQ]);
  if (e1 || e2) throw new Error("Couldn't load classmates' plans.");
  const planBy = new Map((plans as PublicPlan[]).map((p) => [p.user_id, p]));
  return (profiles as Profile[]).filter((p) => planBy.has(p.id)).map((p) => toPerson(p, planBy.get(p.id)!));
}

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
  const row = (data as { total: number; joined: number }[] | null)?.[0];
  return row ?? { total: 0, joined: 0 };
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
