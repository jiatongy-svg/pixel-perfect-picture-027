// ============================================================================
// seed-pilot-users.ts — run ONCE after schema.sql (and again whenever the
// pilot list changes):   npm run seed
//
// What it does, step by step:
//   1. Reads PILOT_ALLOWLIST (comma-separated emails) from .env.local.
//   2. Puts exactly those emails in the `allowed_emails` table (and removes
//      any that are no longer on the list, so they lose access).
//   3. Creates a Supabase Auth account for each email that doesn't have one,
//      because public sign-up is turned off.
// It creates NO fake or demo users. It never prints full email addresses.
// ============================================================================
import { createClient } from "@supabase/supabase-js";

const MAX_PILOT = 6; // the pilot size; you can start with fewer and add people later

function mask(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : undefined;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = process.env.PILOT_ALLOWLIST;
  if (!url || !key || !raw) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or PILOT_ALLOWLIST in .env.local");
  }

  // Step 1: clean up the list.
  const emails = [...new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const bad = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (bad.length) throw new Error(`These don't look like emails: ${bad.map(mask).join(", ")}`);
  if (emails.length === 0 || emails.length > MAX_PILOT) throw new Error(`PILOT_ALLOWLIST has ${emails.length} emails; use 1 to ${MAX_PILOT}.`);
  const nonUsc = emails.filter((e) => !e.endsWith("@usc.edu"));
  if (nonUsc.length) console.warn(`Note: ${nonUsc.length} email(s) are not @usc.edu: ${nonUsc.map(mask).join(", ")}`);

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Step 2: sync the allowlist table.
  const { error: upErr } = await db.from("allowed_emails").upsert(emails.map((email) => ({ email })), { onConflict: "email" });
  if (upErr) throw new Error(`Couldn't write allowed_emails: ${upErr.message}. Did you run supabase/schema.sql?`);
  const { data: current, error: listErr } = await db.from("allowed_emails").select("email");
  if (listErr) throw new Error(listErr.message);
  const removed = (current ?? []).map((r) => r.email as string).filter((e) => !emails.includes(e));
  if (removed.length) {
    await db.from("allowed_emails").delete().in("email", removed);
    console.log(`Removed ${removed.length} email(s) from the allowlist: ${removed.map(mask).join(", ")}`);
  }

  // Step 3: create missing auth accounts (email already confirmed; they sign in with a code).
  const existing = new Set<string>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    data.users.forEach((u) => u.email && existing.add(u.email.toLowerCase()));
    if (data.users.length < 200) break;
  }
  let created = 0;
  for (const email of emails) {
    if (existing.has(email)) continue;
    const { error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw new Error(`Couldn't create ${mask(email)}: ${error.message}`);
    created++;
  }
  console.log(`Done. Allowlist has ${emails.length} emails. Created ${created} new account(s); ${emails.length - created} already existed.`);
}

main().catch((e) => {
  console.error("Seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
