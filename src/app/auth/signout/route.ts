// Signs the user out and sends them to the sign-in page. Used when someone is
// signed in but no longer on the pilot allowlist.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const reason = request.nextUrl.searchParams.get("reason") === "private" ? "?error=private" : "";
  return NextResponse.redirect(new URL(`/signin${reason}`, request.nextUrl.origin));
}
