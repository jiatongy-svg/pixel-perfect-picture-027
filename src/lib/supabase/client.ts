// Supabase client for the browser. Only used to upload profile photos straight
// to Storage (Storage RLS limits each user to their own folder).
"use client";
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  // These two values are public by design; data is protected by RLS.
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
