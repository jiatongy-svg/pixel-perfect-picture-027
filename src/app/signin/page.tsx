// Sign-in page. Signed-in users skip straight into the app.
import { redirect } from "next/navigation";
import { Compass } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SignInForm } from "@/components/SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-14">
      <section className="min-w-0">
        <p className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-accent-text">
          <Compass aria-hidden className="size-5" /> TripMatch
        </p>
        <h1 className="text-3xl font-bold sm:text-[2.75rem] sm:leading-[1.1]">Find classmates whose break plans line up with yours.</h1>
        <p className="mt-4 max-w-prose text-muted">
          A private pilot for USC Marshall MSBA students. Save one plan — a long break or a few weekends — and see who can actually go,
          where you overlap, and what it might cost.
        </p>
        <ol className="mt-6 grid gap-3 text-sm">
          {["Sign in with your USC email", "Build your travel profile and one plan", "Propose a trip; it's set when everyone accepts"].map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-highlight text-xs font-bold text-highlight-text">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </section>
      <section className="min-w-0 rounded-lg border border-border bg-surface-raised p-5 shadow-md sm:p-7">
        <SignInForm initialError={error} />
      </section>
    </main>
  );
}
