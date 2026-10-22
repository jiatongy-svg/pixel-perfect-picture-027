// Filter bar for Explore and Matches. A plain GET form: it works without
// JavaScript and puts the filters in the URL.
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { BREAKS, VIBES } from "@/lib/catalog";
import { hasFilters, type Filters } from "@/lib/filters";
import { inputBase } from "@/components/ui";

export function FilterBar({ action, filters, keep }: { action: string; filters: Filters; keep?: Record<string, string> }) {
  const select = `${inputBase} w-full`;
  return (
    <form method="get" action={action} role="search" aria-label="Filter trips"
      className="mb-5 grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface-raised p-3 shadow-sm sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end">
      {keep && Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs font-medium text-muted sm:col-span-1">
        Destination
        <input name="q" defaultValue={filters.q} placeholder="City or country" className={`${inputBase} w-full`} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted">
        When
        <select name="when" defaultValue={filters.when} className={select}>
          <option value="all">Any</option>
          {BREAKS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          <option value="weekend">Weekends</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted">
        Vibe
        <select name="vibe" defaultValue={filters.vibe} className={select}>
          <option value="">Any</option>
          {VIBES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted">
        Max budget
        <input name="max" type="number" inputMode="numeric" min={0} step={50} defaultValue={filters.max ?? ""} placeholder="$ / person" className={`${inputBase} w-full`} />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-on-accent shadow-sm transition-colors duration-150 hover:bg-accent-hover active:translate-y-px">
          <SlidersHorizontal aria-hidden className="size-4" /> Apply
        </button>
        {hasFilters(filters) && (
          <Link href={keep ? `${action}?${new URLSearchParams(keep)}` : action} className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text">
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}
