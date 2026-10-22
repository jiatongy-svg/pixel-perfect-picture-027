"use client";
// ============================================================================
// DestinationPicker — choose up to N places, in order of preference.
//   * Search box: any city in the world (Open-Meteo city search).
//   * Popular picks: one tap, grouped by region.
// The chosen places show as a numbered list (1 = top pick) with a map link.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { DESTINATIONS, REGIONS, type RegionId } from "@/lib/catalog";
import { catalogPlace, distanceKm, mapUrl, placeLabel, searchCities, type Place } from "@/lib/places";
import { Chip, cx, inputClass } from "@/components/ui";

type Props = { value: Place[]; onChange: (places: Place[]) => void; max: number };

export function DestinationPicker({ value, onChange, max }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const full = value.length >= max;
  const listRef = useRef<HTMLUListElement>(null);

  // Search ~300 ms after the student stops typing; cancel older searches.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setStatus("loading");
      searchCities(q, ctrl.signal)
        .then((r) => { setResults(r); setStatus("idle"); })
        .catch((e) => { if (e?.name !== "AbortError") setStatus("error"); });
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  const byRegion = useMemo(() => {
    const m = new Map<RegionId, typeof DESTINATIONS[number][]>();
    for (const dest of DESTINATIONS) m.set(dest.region, [...(m.get(dest.region) ?? []), dest]);
    return [...m];
  }, []);

  // A place counts as already chosen if it's the same key or the same spot (<1 km).
  const indexOf = (p: Place) => value.findIndex((v) => v.key === p.key || distanceKm(v, p) < 1);
  function add(p: Place) {
    if (indexOf(p) >= 0 || full) return;
    onChange([...value, p]);
    setQuery("");
    setResults([]);
  }
  const remove = (p: Place) => onChange(value.filter((v) => v.key !== p.key));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Chosen places, in order */}
      {value.length > 0 && (
        <ol className="flex flex-col gap-2" aria-label="Your destinations, top pick first">
          {value.map((p, i) => (
            <li key={p.key} className="flex min-w-0 items-center gap-3 rounded-md bg-accent-subtle px-3 py-2">
              <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-on-accent">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={placeLabel(p)}>{placeLabel(p)}</span>
              <a href={mapUrl(p)} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-sm text-xs font-medium text-accent-text underline-offset-4 hover:underline">Map</a>
              <button type="button" onClick={() => remove(p)} aria-label={`Remove ${placeLabel(p)}`}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text">
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* World city search */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="city-search" className="text-sm font-medium">Search any city</label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input id="city-search" type="search" autoComplete="off" className={`${inputClass} pl-9`} placeholder={full ? `You've picked ${max} places` : "Kyoto, Lisbon, Mexico City…"}
            value={query} disabled={full} onChange={(e) => setQuery(e.target.value)} aria-describedby="city-search-hint"
            onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); listRef.current?.querySelector("button")?.focus(); } }} />
          {status === "loading" && <Loader2 aria-hidden className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted" />}
        </div>
        <p id="city-search-hint" className="text-xs text-muted">Any city worldwide. Results come from a free public city database.</p>
        {status === "error" && <p role="alert" className="text-sm text-danger-text">City search isn&apos;t responding. Try again, or tap a popular pick below.</p>}
        {query.trim().length >= 2 && status === "idle" && results.length === 0 && <p className="text-sm text-muted">No cities found for “{query.trim()}”. Check the spelling?</p>}
        {results.length > 0 && (
          <ul ref={listRef} className="flex flex-col overflow-hidden rounded-md border border-border bg-surface-raised shadow-sm" aria-label="City search results">
            {results.map((r) => {
              const picked = indexOf(r) >= 0;
              return (
                <li key={r.key} className="border-b border-border last:border-0">
                  <button type="button" disabled={picked} onClick={() => add(r)}
                    onKeyDown={(e) => {
                      const li = e.currentTarget.parentElement;
                      if (e.key === "ArrowDown") { e.preventDefault(); (li?.nextElementSibling?.querySelector("button") as HTMLButtonElement | null)?.focus(); }
                      if (e.key === "ArrowUp") { e.preventDefault(); ((li?.previousElementSibling?.querySelector("button") as HTMLButtonElement | null) ?? document.getElementById("city-search"))?.focus(); }
                    }}
                    className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-surface-hover focus-visible:bg-surface-hover active:bg-surface-active disabled:cursor-default disabled:opacity-55">
                    <MapPin aria-hidden className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate"><span className="font-medium">{r.name}</span><span className="text-muted">{[r.region, r.country].filter(Boolean).length ? ` · ${[r.region, r.country].filter(Boolean).join(", ")}` : ""}</span></span>
                    {picked && <span className="shrink-0 text-xs text-muted">Added</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Popular picks */}
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-sm font-medium">Popular with classmates</p>
        {byRegion.map(([region, dests]) => (
          <div key={region} className="min-w-0">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{REGIONS[region]}</p>
            <div className="flex flex-wrap gap-2">
              {dests.map((dest) => {
                const p = catalogPlace(dest);
                const rank = indexOf(p);
                return (
                  <Chip key={dest.id} selected={rank >= 0} disabled={rank < 0 && full}
                    onClick={() => (rank >= 0 ? remove(value[rank]) : add(p))}
                    aria-label={rank >= 0 ? `${dest.name}, choice ${rank + 1}` : dest.name}>
                    {rank >= 0 && <span aria-hidden className={cx("inline-flex size-5 items-center justify-center rounded-full bg-accent text-[0.6875rem] font-bold text-on-accent")}>{rank + 1}</span>}
                    {dest.name}
                  </Chip>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
