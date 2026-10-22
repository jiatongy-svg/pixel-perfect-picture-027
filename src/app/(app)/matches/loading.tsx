// Skeleton shaped like the match cards, shown while matches are computed.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading matches">
      <div className="skeleton mb-2 h-8 w-40" />
      <div className="skeleton mb-6 h-4 w-64" />
      <div className="skeleton mb-5 h-10 w-72" />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-5">
            <div className="flex items-center gap-3"><div className="skeleton size-11 rounded-full" /><div className="flex-1"><div className="skeleton mb-2 h-5 w-32" /><div className="skeleton h-4 w-48" /></div></div>
            <div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-16 w-full" /><div className="skeleton h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
