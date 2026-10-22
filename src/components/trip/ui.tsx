import type { ButtonHTMLAttributes, ReactNode } from "react";
import { TripAssistant } from "./TripAssistant";
import { cn } from "@/lib/utils";

export function Screen({ children, step, assistantContext }: { children: ReactNode; step?: string | undefined; assistantContext?: string | undefined }) {
  return (
    <div className="min-h-screen">
      <header className="trip-topbar">
        <div className="mx-auto flex min-h-20 max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <span className="text-xl font-extrabold text-primary">TripMatch</span>
          {step && <span className="text-sm font-semibold text-primary">{step}</span>}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-2xl flex-col px-5 pb-24 pt-8">{children}</div>
      <TripAssistant context={assistantContext} />
    </div>
  );
}

export function PrimaryButton({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={cn(
        "h-14 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-card transition active:scale-[0.98] disabled:opacity-40",
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
        "h-14 w-full rounded-xl border border-primary bg-card text-base font-semibold text-primary transition active:scale-[0.98] disabled:opacity-40",
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
        "relative flex min-h-14 w-full items-center gap-3 rounded-xl border-2 bg-card px-4 py-3 text-left transition active:scale-[0.99]",
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
