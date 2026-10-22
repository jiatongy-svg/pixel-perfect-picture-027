"use client";
// ============================================================================
// Sign-in flow, in three states:
//   1. "email"   — type your pilot email, we send a code + link
//   2. "code"    — check your inbox; type the code (or click the link)
//   3. "private" — this email isn't part of the pilot
// The server never creates new accounts, so only pre-added students get in.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import { Lock, MailCheck } from "lucide-react";
import { sendSignInEmail, verifySignInCode } from "@/app/actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

const LINK_ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new code below.",
};

export function SignInForm({ initialError }: { initialError?: string }) {
  const [step, setStep] = useState<"email" | "code" | "private">(initialError === "private" ? "private" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError ? LINK_ERRORS[initialError] ?? null : null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  // Count down before "Resend" becomes available (Supabase allows one email per minute).
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function send() {
    setError(null);
    startTransition(async () => {
      const r = await sendSignInEmail(email);
      if (r.ok) {
        setStep("code");
        setCooldown(60);
      } else if (r.error === "PRIVATE") setStep("private");
      else setError(r.error);
    });
  }

  function verify() {
    setError(null);
    startTransition(async () => {
      const r = await verifySignInCode(email, code);
      // On success the server redirects; we only get here on failure.
      if (r && !r.ok) r.error === "PRIVATE" ? setStep("private") : setError(r.error);
    });
  }

  if (step === "private") {
    return (
      <div className="flex flex-col gap-4">
        <Lock aria-hidden className="size-7 text-muted" />
        <h2 className="text-xl font-semibold">This pilot is private</h2>
        <p className="text-muted">
          TripMatch is being tested with a small group of MSBA students right now, and this email isn't part of it. If you think that's a
          mistake, ask the pilot organizer which email they added for you.
        </p>
        <Button variant="secondary" onClick={() => { setStep("email"); setError(null); }}>Try a different email</Button>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); verify(); }}>
        <MailCheck aria-hidden className="size-7 text-accent-text" />
        <div>
          <h2 className="text-xl font-semibold">Check your inbox</h2>
          <p className="mt-1 break-words text-muted">
            We sent a sign-in code to <span className="font-medium text-text">{email}</span>. Type it here, or tap the link in the email on this device.
          </p>
        </div>
        <Field id="code" label="Sign-in code" error={error ?? undefined}>
          <input
            id="code" className={`${inputClass} tracking-[0.3em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={8}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-invalid={!!error} aria-describedby={error ? "code-error" : undefined} autoFocus
          />
        </Field>
        <Button type="submit" loading={pending} disabled={code.length < 6}>Sign in</Button>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" className="rounded-sm text-muted underline-offset-4 hover:text-text hover:underline" onClick={() => { setStep("email"); setCode(""); setError(null); }}>
            Use a different email
          </button>
          <Button type="button" variant="ghost" size="sm" disabled={cooldown > 0 || pending} onClick={send}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <div>
        <h2 className="text-xl font-semibold">Sign in</h2>
        <p className="mt-1 text-muted">Use the email the pilot organizer added for you. No password needed.</p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Field id="email" label="Email">
        <input id="email" type="email" autoComplete="email" required className={inputClass} placeholder="tommy@usc.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" loading={pending} disabled={!email.includes("@")}>Email me a code</Button>
    </form>
  );
}
