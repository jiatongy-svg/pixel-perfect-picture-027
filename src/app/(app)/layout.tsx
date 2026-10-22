// The signed-in app frame: top bar on every screen, plus a bottom tab bar on
// phones. Every page inside (app)/ is protected by getViewer().
import Link from "next/link";
import { Compass } from "lucide-react";
import { getViewer } from "@/lib/data";
import { NavLinks } from "@/components/NavLinks";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await getViewer();
  // RLS only counts proposals this user is a member of.
  const { count } = await supabase.from("proposals").select("id", { count: "exact", head: true }).eq("status", "pending");
  const onboarded = !!profile?.completed;

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="bg-brand-gradient sticky top-0 z-10 border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 rounded-sm font-bold text-accent-text">
            <Compass aria-hidden className="size-5" /> TripMatch
          </Link>
          {onboarded && <NavLinks pending={count ?? 0} placement="top" />}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      {onboarded && <NavLinks pending={count ?? 0} placement="bottom" />}
    </div>
  );
}
