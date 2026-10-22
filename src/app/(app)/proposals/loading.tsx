export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading proposals">
      <div className="skeleton mb-2 h-8 w-40" />
      <div className="skeleton mb-8 h-4 w-64" />
      {[0, 1, 2].map((i) => <div key={i} className="skeleton mb-2 h-[76px] w-full rounded-lg" />)}
    </div>
  );
}
