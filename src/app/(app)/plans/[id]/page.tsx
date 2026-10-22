import Link from "next/link";
import { notFound } from "next/navigation";
import { PLAN_LIMITS } from "@/lib/constants";
import { todayLA, upcomingFridays } from "@/lib/dates";
import { getOnboardedViewer, planName } from "@/lib/data";
import { DeletePlanButton } from "@/components/DeletePlanButton";
import { PlanForm } from "@/components/PlanForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, plans } = await getOnboardedViewer();
  const plan = plans.find((p) => p.id === id);
  if (!plan) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={planName(plan)} subtitle="Changes apply to new matches right away. Open proposals keep the version they were made with."
        action={<Link href="/plans" className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text">Back to my plans</Link>} />
      <PlanForm initial={plan} profile={profile} fridays={upcomingFridays(todayLA(), PLAN_LIMITS.weekendHorizonDays)} />
      <div className="mt-8 border-t border-border pt-6">
        <DeletePlanButton planId={plan.id} />
      </div>
    </div>
  );
}
