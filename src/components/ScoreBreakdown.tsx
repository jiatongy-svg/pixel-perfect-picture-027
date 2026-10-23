// How a match score adds up: five meters (dates /45, destination /20,
// group size /15, budget /10, style /10 — see WEIGHTS in constants.ts). One green fill on a light track; the number is
// written next to each bar, so nothing depends on reading the color.
import { WEIGHTS } from "@/lib/constants";
import type { PairResult } from "@/lib/matching";

const ROWS = [
  { key: "dates", label: "Dates" },
  { key: "destination", label: "Destination" },
  { key: "groupSize", label: "Group size" },
  { key: "budget", label: "Budget" },
  { key: "style", label: "Style" },
] as const;

export function ScoreBreakdown({ parts }: { parts: PairResult["parts"] }) {
  return (
    <dl className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-x-3 gap-y-2 text-sm">
      {ROWS.map(({ key, label }) => {
        const max = WEIGHTS[key];
        const value = Math.round(parts[key]);
        return (
          <div key={key} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="m-0">
              <div role="meter" aria-label={`${label} score`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}
                className="h-2 overflow-hidden rounded-sm bg-surface-sunken">
                <div className="h-full rounded-sm bg-accent" style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </dd>
            <dd className="m-0 text-right tabular-nums">{value} / {max}</dd>
          </div>
        );
      })}
    </dl>
  );
}
