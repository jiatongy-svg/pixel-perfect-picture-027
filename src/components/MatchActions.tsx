"use client";
// Small client-side buttons for the Matches page.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { clearPasses } from "@/app/actions";
import { Button } from "@/components/ui";

// Re-runs matching on the server with everyone's latest plans.
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" size="sm" loading={pending} onClick={() => start(() => router.refresh())}>
      {!pending && <RefreshCw aria-hidden className="size-4" />} Refresh
    </Button>
  );
}

export function ClearPassesButton() {
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" loading={pending} onClick={() => start(async () => { await clearPasses(); })}>
      Show passed matches again
    </Button>
  );
}
