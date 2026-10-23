// ============================================================================
// Demo sign-in: a fixed code for a few named demo accounts, for presenting
// somewhere the sign-in email can't arrive (e.g. no phone signal).
//
// OFF unless both are set in Vercel -> Settings -> Environment Variables:
//   DEMO_SIGNIN_EMAILS  e.g. "demo1@usc.edu,demo2@usc.edu"
//   DEMO_SIGNIN_CODE    8 digits, e.g. "48201937" (never commit it)
// Every other address still needs the emailed code. Remove the variables
// (and redeploy) after the presentation to switch it off.
// ============================================================================
import { timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;

export function demoConfig(env: Env = process.env): { emails: Set<string>; code: string } | null {
  const code = (env.DEMO_SIGNIN_CODE ?? "").trim();
  const emails = new Set((env.DEMO_SIGNIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
  // An 8-digit code at minimum, so it can't be guessed by trying them all.
  if (!/^\d{8}$/.test(code) || emails.size === 0) return null;
  return { emails, code };
}

export const isDemoEmail = (email: string, env: Env = process.env) => !!demoConfig(env)?.emails.has(email.trim().toLowerCase());

// True only for a demo email AND the exact demo code (compared in constant time).
export function demoCodeMatches(email: string, code: string, env: Env = process.env): boolean {
  const cfg = demoConfig(env);
  if (!cfg || !cfg.emails.has(email.trim().toLowerCase())) return false;
  const a = Buffer.from(code.trim());
  const b = Buffer.from(cfg.code);
  return a.length === b.length && timingSafeEqual(a, b);
}
