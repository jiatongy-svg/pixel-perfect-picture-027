// The page a sign-in email link opens. It does NOT sign in by itself (see
// finish/route.ts for why); the student taps the button to finish.
import { redirect } from "next/navigation";
import { Compass } from "lucide-react";

export const dynamic = "force-dynamic";

type Params = { token_hash?: string; code?: string; type?: string; next?: string; error?: string };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  if (p.error || (!p.token_hash && !p.code)) redirect("/signin?error=link");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4">
      <p className="inline-flex items-center gap-2 text-sm font-semibold text-accent-text"><Compass aria-hidden className="size-5" /> TripMatch</p>
      <h1 className="text-2xl font-bold">One tap to finish signing in</h1>
      <p className="text-muted">This extra step keeps email security scanners from using up your sign-in link.</p>
      <form method="post" action="/auth/confirm/finish">
        {p.token_hash && <input type="hidden" name="token_hash" value={p.token_hash} />}
        {p.code && <input type="hidden" name="code" value={p.code} />}
        <input type="hidden" name="type" value={p.type ?? "email"} />
        <input type="hidden" name="next" value={p.next ?? "/"} />
        <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 font-medium text-on-accent shadow-sm transition-colors duration-150 hover:bg-accent-hover active:translate-y-px">
          Finish signing in
        </button>
      </form>
    </main>
  );
}
