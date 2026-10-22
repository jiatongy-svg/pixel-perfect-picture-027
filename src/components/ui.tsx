// ============================================================================
// ui.tsx — small shared building blocks. Every control has rest, hover,
// active (pressed), focus-visible and disabled states, plus "loading" for
// buttons that send a request.
// ============================================================================
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

const variants = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover active:translate-y-px shadow-sm",
  secondary: "bg-surface-raised text-text border border-border-interactive hover:bg-surface-hover active:bg-surface-active",
  ghost: "text-text hover:bg-surface-hover active:bg-surface-active",
  danger: "bg-surface-raised text-danger-text border border-danger hover:bg-danger-bg active:translate-y-px",
};

export function Button({ variant = "primary", size = "md", loading, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap",
        "transition-[background-color,transform,opacity] duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-55 disabled:translate-y-0",
        size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-4 text-[0.9375rem]",
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form field: visible label, optional hint, inline error tied by aria-describedby
// ---------------------------------------------------------------------------
export function Field({ id, label, hint, error, children, optional }: { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode; optional?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {hint && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>}
      {children}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-sm text-danger-text" role="alert">
          <AlertCircle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// Base input look without a width; inputClass adds full width (the common case).
export const inputBase =
  "h-11 min-w-0 rounded-md border border-border-interactive bg-surface-raised px-3 text-base text-text " +
  "transition-colors duration-150 hover:border-text aria-[invalid=true]:border-danger disabled:opacity-55";
export const inputClass = `${inputBase} w-full`;

// For a group of chips/radios: a fieldset with a legend instead of a label.
export function Group({ legend, hint, error, children, id }: { legend: string; hint?: ReactNode; error?: string; children: ReactNode; id?: string }) {
  return (
    <fieldset id={id} className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 text-sm font-medium">{legend}</legend>
      {hint && <p className="-mt-1 text-sm text-muted">{hint}</p>}
      {children}
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-danger-text" role="alert">
          <AlertCircle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Chip: a toggle button (aria-pressed) for multi-select tags.
// ---------------------------------------------------------------------------
export function Chip({ selected, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={cx(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
        "transition-colors duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55",
        selected ? "border-accent bg-accent-subtle text-accent-text" : "border-border-interactive bg-surface-raised text-text hover:bg-surface-hover",
        className,
      )}
    >
      {children}
    </button>
  );
}

// A large selectable card (radio-like). Use inside a Group with role="radiogroup".
export function OptionCard({ selected, title, description, onSelect, disabled }: { selected: boolean; title: string; description?: string; onSelect: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        "flex w-full min-w-0 flex-col items-start rounded-md border p-3 text-left transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-55 active:bg-surface-active",
        selected ? "border-accent bg-accent-subtle ring-1 ring-accent" : "border-border-interactive bg-surface-raised hover:bg-surface-hover",
      )}
    >
      <span className={cx("text-sm font-semibold", selected && "text-accent-text")}>{title}</span>
      {description && <span className="text-sm text-muted">{description}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Surfaces and feedback
// ---------------------------------------------------------------------------
export function Card({ children, className, as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "article" | "div" }) {
  return <Tag className={cx("min-w-0 rounded-lg border border-border bg-surface-raised p-4 shadow-sm sm:p-5", className)}>{children}</Tag>;
}

export function Badge({ tone = "neutral", children }: { tone?: "highlight" | "neutral" | "success" | "warning" | "danger" | "info"; children: ReactNode }) {
  const tones = {
    highlight: "bg-highlight text-highlight-text",
    neutral: "bg-surface-sunken text-text",
    success: "bg-success-bg text-success-text",
    warning: "bg-warning-bg text-warning-text",
    danger: "bg-danger-bg text-danger-text",
    info: "bg-info-bg text-info-text",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tones[tone])}>{children}</span>;
}

export function Notice({ tone, title, children, action }: { tone: "info" | "success" | "warning" | "error"; title?: string; children?: ReactNode; action?: ReactNode }) {
  const map = {
    info: { cls: "bg-info-bg text-info-text", Icon: Info },
    success: { cls: "bg-success-bg text-success-text", Icon: CheckCircle2 },
    warning: { cls: "bg-warning-bg text-warning-text", Icon: TriangleAlert },
    error: { cls: "bg-danger-bg text-danger-text", Icon: AlertCircle },
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-md p-3 text-sm", map.cls)}>
      <map.Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-text">{children}</div>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-raised px-5 py-10 text-center">
      <div aria-hidden className="text-muted [&>svg]:size-8">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Avatar({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image adds nothing here
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent-subtle font-semibold text-accent-text" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-[2rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
