// First run: step 1 travel profile, step 2 current plan (can be skipped).
import Link from "next/link";
import { PLAN_LIMITS } from "@/lib/constants";
import { todayLA, upcomingFridays } from "@/lib/dates";
import { getViewer, photoUrls } from "@/lib/data";
import { ProfileForm } from "@/components/ProfileForm";
import { PlanForm } from "@/components/PlanForm";
import { PageHeader, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { supabase, userId, profile, plan } = await getViewer();
  const step = (await searchParams).step === "plan" && profile?.completed ? "plan" : "profile";
  const urls = await photoUrls(supabase, [profile?.photo_path ?? null]);

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-6 flex gap-2 text-sm" aria-label="Setup steps">
        {[["profile", "1. Travel profile"], ["plan", "2. Your plan"]].map(([id, label]) => (
          <li key={id} aria-current={step === id ? "step" : undefined}
            className={cx("rounded-full px-3 py-1 font-medium", step === id ? "bg-accent text-on-accent" : "bg-surface-sunken text-muted")}>{label}</li>
        ))}
      </ol>
      {step === "profile" ? (
        <>
          <PageHeader title="Welcome to TripMatch" subtitle="First, tell classmates what you're like to travel with. This stays the same across trips." />
          <ProfileForm userId={userId} initial={profile} photoUrl={profile?.photo_path ? urls[profile.photo_path] ?? null : null} next="/onboarding?step=plan" />
        </>
      ) : (
        <>
          <PageHeader title="What's your next trip?" subtitle={
            <>One plan at a time. Don't have a destination yet? Just pick when you're free. <Link href="/matches" className="font-medium text-accent-text underline-offset-4 hover:underline">Skip for now</Link></>
          } />
          <PlanForm initial={plan} profile={profile!} fridays={upcomingFridays(todayLA(), PLAN_LIMITS.weekendHorizonDays)} next="/matches" />
        </>
      )}
    </div>
  );
}
