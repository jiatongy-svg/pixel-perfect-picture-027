// ============================================================================
// rls-check.ts — proves the security rules on the REAL Supabase project.
//   npm run rls-check
//
// Signs in as two pilot users (without sending any email: the admin API makes
// a one-time login token), then tries things they must NOT be able to do.
// It only reads, or attempts writes that the database must refuse — it does
// not change anyone's data. Users need a saved profile for some checks.
// ============================================================================
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const emails = (process.env.PILOT_ALLOWLIST ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function signInAs(admin: SupabaseClient, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink failed: ${error.message}`);
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await client.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (e2 || !s.user) throw new Error(`verifyOtp failed: ${e2?.message}`);
  return { client, id: s.user.id };
}

async function main() {
  if (!url || !anon || !service || emails.length < 2) throw new Error("Need the Supabase env vars and at least 2 PILOT_ALLOWLIST emails in .env.local");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const a = await signInAs(admin, emails[0]);
  const b = await signInAs(admin, emails[1]);

  // 1. Signed-out visitors can't read anything.
  const outsider = createClient(url, anon, { auth: { persistSession: false } });
  const { data: anonRows } = await outsider.from("profiles").select("id");
  check("signed-out visitor reads no profiles", !anonRows || anonRows.length === 0);

  // 2. Nobody can read the allowlist.
  const { data: allow } = await a.client.from("allowed_emails").select("email");
  check("user cannot read allowed_emails", !allow || allow.length === 0);

  // 3. A can't change B's plan or profile.
  const { data: upd } = await a.client.from("travel_plans").update({ notes: "hacked" }).eq("user_id", b.id).select("user_id");
  check("user cannot update another user's plan", !upd || upd.length === 0);
  const { data: updP } = await a.client.from("profiles").update({ display_name: "hacked" }).eq("id", b.id).select("id");
  check("user cannot update another user's profile", !updP || updP.length === 0);

  // 4. A can't insert a plan for B.
  const { error: insErr } = await a.client.from("travel_plans").insert({ user_id: b.id, timing_mode: "weekends", weekends: ["2030-01-04"], trip_length_min: 1, trip_length_max: 2, destination_flex: "open", budget_min: 0, budget_max: 100 });
  check("user cannot insert a plan for someone else", !!insErr, insErr?.message);

  // 5. A only ever sees their own plan row (with notes); others only via plan_cards (no notes).
  const { data: plans } = await a.client.from("travel_plans").select("user_id");
  check("travel_plans returns only your own row", (plans ?? []).every((p) => p.user_id === a.id));
  const { error: notesErr } = await a.client.from("plan_cards").select("notes").limit(1);
  check("plan_cards does not expose notes", !!notesErr);

  // 6. Proposals: no direct writes, no creating as someone else.
  const { error: rpcErr } = await a.client.rpc("create_proposal", { p_actor: b.id, p_members: [a.id, b.id], p_snapshots: [], p_merged: {} });
  check("user cannot call create_proposal directly", !!rpcErr, rpcErr?.message);
  const { error: apprErr } = await a.client.from("proposal_approvals").insert({ proposal_id: "00000000-0000-0000-0000-000000000000", version: 1, user_id: b.id });
  check("user cannot insert an approval for someone else", !!apprErr, apprErr?.message);

  await a.client.auth.signOut();
  await b.client.auth.signOut();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll RLS checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("RLS check could not run:", e instanceof Error ? e.message : e);
  process.exit(1);
});
