// ============================================================================
// Supabase ADMIN client — uses the secret service role key, which skips RLS.
//
// "server-only" makes the build fail if any browser code imports this file,
// so the key can never end up in the browser bundle.
// We use it for exactly two things: create_proposal and counter_proposal
// (the server computes the merged trip, then passes the verified user id).
// ============================================================================
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (server-only). See SETUP_CHECKLIST.md.");
  return createClient(publicEnv.supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
