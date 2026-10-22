// ============================================================================
// My plans — every trip plan I've saved (up to 5). Each one is matched on its
// own. Tap a plan to edit it; "Add a plan" starts a new one.
// ============================================================================
import Link from "next/link";
import { CalendarPlus, ChevronRight, Plus } from "lucide-react";
import { vibeLabel } from "@/lib/catalog";
import { PLAN_LIMITS } from "@/lib/constants";
import { todayLA } from "@/lib/dates";
import { budgetText, whenText, whereText } from "@/lib/describe";
import { getOnboardedViewer, planName } from "@/lib/data";
import { EmptyState, Notice, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const addButton = "inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 font-medium text-on-accent shadow-sm transition-colors duration-150 hover:bg-accent-hover active:translate-y-px";

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ saved?: string; deleted?: string }> }) {
  const { saved, deleted } = await searchParams;
  const { plans } = await getOnboardedViewer();
  const today = todayLA();
  const full = plans.length >= PLAN_LIMITS.maxPlans;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="My plans"
        subtitle={`Save a plan for each trip you're thinking about — up to ${PLAN_LIMITS.maxPlans}. Each one gets its own matches.`}
        action={!full && plans.length > 0 ? <Link href="/plans/new" className={addButton}><Plus aria-hidden className="size-4" /> Add a plan</Link> : undefined}
      />
      {saved && <div className="mb-4"><Notice tone="success">Plan saved. Matches now use it.</Notice></div>}
      {deleted && <div className="mb-4"><Notice tone="info">Plan deleted.</Notice></div>}

      {plans.length === 0 ? (
        <EmptyState icon={<CalendarPlus />} title="No plans yet" action={<Link href="/plans/new" className={addButton}><Plus aria-hidden className="size-4" /> Add your first plan</Link>}>
          Pick a long break or a few weekends. No destination yet? Choose “I&apos;m open to anywhere”.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {plans.map((p) => (
            <li key={p.id}>
              <Link href={`/plans/${p.id}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-sm transition-colors duration-150 hover:bg-surface-hover active:bg-surface-active">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold" title={planName(p)}>{planName(p)}</p>
                  <p className="truncate text-sm text-muted">{whereText(p)}</p>
                  <p className="text-sm text-muted">{whenText(p, today)} · {budgetText(p)}{p.vibes.length ? ` · ${p.vibes.map(vibeLabel).join(", ")}` : ""}</p>
                </div>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {full && <p className="mt-4 text-sm text-muted">You have {PLAN_LIMITS.maxPlans} plans, the most you can save. Delete one to add another.</p>}
    </div>
  );
}
