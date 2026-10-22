import { moneyDraft, moneyValue } from "@/lib/traveler";
export function BudgetFields({ min, max, onMin, onMax }: { min: string; max: string; onMin: (value: string) => void; onMax: (value: string) => void }) {
  const a = moneyValue(min), b = moneyValue(max);
  return <div><div className="grid grid-cols-2 gap-3">{[{ label: "Minimum budget", value: min, change: onMin }, { label: "Maximum budget", value: max, change: onMax }].map(({ label, value, change }) => <label key={label} className="text-sm font-semibold">{label}<div className="relative mt-2"><span aria-hidden className="pointer-events-none absolute left-4 top-4">$</span><input aria-label={label} type="text" inputMode="numeric" pattern="[0-9]*" value={value} placeholder="0" onChange={(event) => { const next = moneyDraft(event.target.value); if (next !== null) change(next); }} className="h-14 w-full rounded-xl border-2 border-border bg-card pr-3 pl-8 outline-none focus:border-primary" /></div></label>)}</div>
    <p className="mt-3 text-sm text-muted-foreground">Per person, for the whole trip. You can clear either field before entering an amount.</p>
    {a !== null && b !== null && b < a && <p role="alert" className="mt-2 text-sm text-destructive">Maximum budget must be at least the minimum.</p>}
  </div>;
}
