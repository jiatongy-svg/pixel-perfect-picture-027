// ============================================================================
// /auth/confirm — where the sign-in email link lands.
// Supabase puts a one-time token_hash in the link; we exchange it for a
// session cookie, then send the student into the app.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  // Only allow redirects inside this site (never to another domain).
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const { data: allowed } = await supabase.rpc("is_allowlisted");
      if (!allowed) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/signin?error=private", origin));
      }
      return NextResponse.redirect(new URL(safeNext, origin));
    }
  }
  return NextResponse.redirect(new URL("/signin?error=link", origin));
}
