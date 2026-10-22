import type { ReactNode } from "react";
import { PrimaryButton, Screen } from "./ui";
export function QuestionScreen({ step, total, title, children, next, canNext, busy, error, onBack, context }: { step: number; total: number; title: string; children: ReactNode; next?: (() => void) | undefined; canNext?: boolean; busy: boolean; error: string | null; onBack: () => void; context: string }) {
  return <Screen step={`${step} of ${total}`} assistantContext={context}>
    <div className="mb-6 h-1.5 w-full rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${step / total * 100}%` }} /></div>
    <button onClick={onBack} disabled={busy} className="mb-3 self-start text-sm font-semibold text-muted-foreground">← Back</button>
    <h2 className="mb-6 text-2xl font-extrabold">{title}</h2><div className="space-y-3">{children}</div>
    {next && <div className="mt-auto pt-8"><PrimaryButton disabled={!canNext || busy} onClick={next}>{busy ? "Saving plan…" : "Next"}</PrimaryButton></div>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </Screen>;
}
