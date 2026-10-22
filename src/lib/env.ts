// ============================================================================
// env.ts — reads settings from environment variables, with clear errors.
//
// NEXT_PUBLIC_* values are safe to show in the browser (the anon key is
// designed to be public; RLS protects the data). Everything else is secret
// and must only be read on the server.
// ============================================================================

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example and SETUP_CHECKLIST.md.`);
  }
  return value;
}

// Public (browser-safe). Next.js inlines these at build time, so they must be
// written out literally like this — not looked up by a dynamic name.
export const publicEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};
