import { PLAN_LIMITS } from "@/lib/constants";
import { todayLA, upcomingFridays } from "@/lib/dates";
import { getOnboardedViewer } from "@/lib/data";
import { PlanForm } from "@/components/PlanForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const { profile, plan } = await getOnboardedViewer();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={plan ? "My plan" : "Add your plan"}
        subtitle={plan ? "Changes apply to new matches right away. Open proposals keep the plans they were made with." : "One plan at a time. You can be open on destination."}
      />
      <PlanForm initial={plan} profile={profile} fridays={upcomingFridays(todayLA(), PLAN_LIMITS.weekendHorizonDays)} next={plan ? undefined : "/matches"} />
    </div>
  );
}
