"use client";
// Shown if a page fails to load (for example, the database is unreachable).
import { Button, EmptyState } from "@/components/ui";
import { CloudOff } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert">
      <EmptyState icon={<CloudOff />} title="Couldn't load this page" action={<Button onClick={reset}>Try again</Button>}>
        Something went wrong reaching the server. Your saved profile, plan and proposals are safe.
      </EmptyState>
    </div>
  );
}
