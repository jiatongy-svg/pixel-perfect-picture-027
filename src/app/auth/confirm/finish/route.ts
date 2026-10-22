// ============================================================================
// POST /auth/confirm/finish — actually signs the student in.
//
// Why a separate POST step? USC email (Microsoft Outlook "Safe Links") opens
// every link in an email BEFORE the student clicks it, to scan it. If opening
// the link signed you in, the scanner would use up the one-time token and the
// real click would fail with "link expired". Scanners only open links (GET);
// they don't press buttons (POST). So the email link shows a page with a
// button, and the button posts here.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const TYPES = new Set(["email", "magiclink", "signup", "invite", "recovery", "email_change"]);

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const code = String(form.get("code") ?? "");
  const rawType = String(form.get("type") ?? "email");
  const type = (TYPES.has(rawType) ? rawType : "email") as EmailOtpType;
  // Only allow redirects inside this site (never to another domain).
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (tokenHash || code) {
    const supabase = await createClient();
    const { error } = code ? await supabase.auth.exchangeCodeForSession(code) : await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const { data: allowed } = await supabase.rpc("is_allowlisted");
      if (!allowed) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/signin?error=private", origin), 303);
      }
      return NextResponse.redirect(new URL(safeNext, origin), 303);
    }
  }
  return NextResponse.redirect(new URL("/signin?error=link", origin), 303);
}
