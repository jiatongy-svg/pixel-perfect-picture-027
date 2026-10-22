// ============================================================================
// Supabase client for Server Components, Server Actions and Route Handlers.
//
// It reads the signed-in user's session from cookies, so every query runs
// AS THAT USER and Row Level Security applies. Create a new one per request.
// ============================================================================
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        // Server Components can't set cookies (only actions/route handlers can).
        // That's fine: proxy.ts refreshes the session cookie on every request.
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {}
      },
    },
  });
}
