import { redirect } from "next/navigation";
import { PLAN_LIMITS } from "@/lib/constants";
import { todayLA, upcomingFridays } from "@/lib/dates";
import { getOnboardedViewer } from "@/lib/data";
import { PlanForm } from "@/components/PlanForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewPlanPage() {
  const { profile, plans } = await getOnboardedViewer();
  if (plans.length >= PLAN_LIMITS.maxPlans) redirect("/plans");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add a plan" subtitle="One trip idea. You can be open on destination." />
      <PlanForm initial={null} profile={profile} fridays={upcomingFridays(todayLA(), PLAN_LIMITS.weekendHorizonDays)} next={plans.length === 0 ? "/matches" : undefined} />
    </div>
  );
}
