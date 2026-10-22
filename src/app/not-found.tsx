import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="text-muted">This page doesn't exist, or it belongs to a proposal you're not part of.</p>
      <Link href="/matches" className="inline-flex h-11 items-center rounded-md bg-accent px-4 font-medium text-on-accent hover:bg-accent-hover">Go to matches</Link>
    </main>
  );
}
