import type { ButtonHTMLAttributes, ReactNode } from "react";
import { TripAssistant } from "./TripAssistant";
import { cn } from "@/lib/utils";

export function Screen({ children, step, assistantContext }: { children: ReactNode; step?: string | undefined; assistantContext?: string | undefined }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-24 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <span className="font-display text-lg font-extrabold text-primary">
          Trip<span className="text-accent-foreground">Match</span>
          <span className="ml-1 inline-block h-2 w-2 rounded-full bg-accent" />
        </span>
        {step && <span className="text-xs font-semibold text-muted-foreground">{step}</span>}
      </header>
      {children}
      <TripAssistant context={assistantContext} />
    </div>
  );
}

export function PrimaryButton({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={cn(
        "h-14 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-card transition active:scale-[0.98] disabled:opacity-40",
        className,
      )}
    />
  );
}

export function GhostButton({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={cn(
        "h-14 w-full rounded-2xl border-2 border-border bg-card text-base font-semibold text-foreground transition active:scale-[0.98] disabled:opacity-40",
        className,
      )}
    />
  );
}

export function Option({ selected, children, onClick, badge }: { selected?: boolean; children: ReactNode; onClick?: () => void; badge?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 bg-card px-4 py-3 text-left transition active:scale-[0.99]",
        selected ? "border-primary bg-secondary" : "border-border",
      )}
    >
      {badge}
      <div className="flex-1">{children}</div>
    </button>
  );
}

export function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "gold" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        tone === "gold" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
