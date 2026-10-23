"use client";
// Main navigation. Same links in two places: inline in the header on wide
// screens, and as a bottom tab bar on phones (thumb-friendly).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, Compass, Luggage, Sparkles, UserRound } from "lucide-react";
import { cx } from "@/components/ui";

const LINKS = [
  { href: "/matches", label: "Matches", Icon: Sparkles },
  { href: "/discover", label: "Discover", Icon: Compass },
  { href: "/trips", label: "My trips", Icon: Luggage },
  { href: "/plans", label: "My plans", Icon: CalendarRange },
  { href: "/profile", label: "Profile", Icon: UserRound },
];

export function NavLinks({ pending, placement }: { pending: number; placement: "top" | "bottom" }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/") || (href === "/trips" && path.startsWith("/proposals"));

  if (placement === "top") {
    return (
      <nav aria-label="Main" className="hidden md:block">
        <ul className="flex items-center gap-1">
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={cx(
                  "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                  active(href) ? "bg-surface-raised text-accent-text shadow-sm" : "text-text hover:bg-surface-raised/60",
                )}
              >
                {label}
                {href === "/trips" && pending > 0 && <span className="rounded-full bg-highlight px-1.5 text-xs font-bold text-highlight-text">{pending}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface-raised md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {LINKS.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cx(
                "relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors duration-150 active:bg-surface-active",
                active(href) ? "text-accent-text" : "text-muted hover:text-text",
              )}
            >
              <Icon aria-hidden className="size-5" />
              {label}
              {href === "/trips" && pending > 0 && (
                <span className="absolute top-2 left-[calc(50%+6px)] rounded-full bg-highlight px-1.5 text-[0.6875rem] font-bold text-highlight-text" aria-label={`${pending} pending`}>{pending}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
