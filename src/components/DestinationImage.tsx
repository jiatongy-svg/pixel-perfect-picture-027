"use client";
// ============================================================================
// A photo of the destination, from Wikipedia (freely licensed images only),
// with a "Photo source" credit link as the license asks. Adapted from Steven's
// prototype. If no photo is found, a calm placeholder with the name shows.
// ============================================================================
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { mapUrl, placeLabel, type Place } from "@/lib/places";
import { cx } from "@/components/ui";

// Wikipedia article titles for quick picks whose names aren't article titles.
const ARTICLE: Record<string, string> = {
  "joshua-tree": "Joshua Tree National Park",
  yosemite: "Yosemite National Park",
  "zion-bryce": "Zion National Park",
  "grand-canyon-sedona": "Grand Canyon",
  "big-bear": "Big Bear Lake, California",
  malibu: "El Matador State Beach",
  catalina: "Santa Catalina Island (California)",
  mammoth: "Mammoth Lakes, California",
  "big-sur": "Big Sur",
  oahu: "Oahu",
  cabo: "Cabo San Lucas",
  cancun: "Cancún",
  "new-york": "New York City",
  "palm-springs": "Palm Springs, California",
  "santa-barbara": "Santa Barbara, California",
  "san-diego": "San Diego",
};

type Photo = { url: string; file: string } | null;
const cache = new Map<string, Photo>();

export function DestinationImage({ place, className }: { place: Place; className?: string }) {
  const title = ARTICLE[place.key] ?? place.name;
  const [photo, setPhoto] = useState<Photo | undefined>(cache.get(title));

  useEffect(() => {
    if (cache.has(title)) { setPhoto(cache.get(title)); return; }
    const ctrl = new AbortController();
    const q = new URLSearchParams({ action: "query", format: "json", origin: "*", prop: "pageimages", titles: title, piprop: "thumbnail|name", pithumbsize: "800", pilicense: "free", redirects: "1" });
    fetch(`https://en.wikipedia.org/w/api.php?${q}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => {
        const pages = Object.values(data.query?.pages ?? {}) as { thumbnail?: { source?: string }; pageimage?: string }[];
        const page = pages.find((p) => /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(p.thumbnail?.source ?? ""));
        const result: Photo = page?.thumbnail?.source && page.pageimage ? { url: page.thumbnail.source, file: page.pageimage } : null;
        cache.set(title, result);
        setPhoto(result);
      })
      .catch((e) => { if (e?.name !== "AbortError") setPhoto(null); });
    return () => ctrl.abort();
  }, [title]);

  return (
    <div className={cx("relative h-36 overflow-hidden rounded-md bg-surface-sunken", className)}>
      {photo === undefined && <div className="skeleton absolute inset-0 rounded-none" aria-hidden />}
      {photo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- remote Wikimedia thumbnail */}
          <img src={photo.url} alt={`View of ${placeLabel(place)}`} loading="lazy" onError={() => setPhoto(null)} className="h-full w-full object-cover" />
          <a href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(photo.file)}`} target="_blank" rel="noopener noreferrer"
            className="absolute right-1.5 bottom-1.5 rounded-sm bg-surface-raised/90 px-1.5 py-0.5 text-[0.6875rem] text-text">Photo source</a>
        </>
      ) : photo === null ? (
        <div className="flex h-full items-center justify-center gap-2 px-4 text-center text-sm text-muted">
          <MapPin aria-hidden className="size-4" /> {placeLabel(place)}
        </div>
      ) : null}
      <a href={mapUrl(place)} target="_blank" rel="noopener noreferrer"
        className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-sm bg-surface-raised/90 px-2 py-1 text-xs font-medium text-accent-text shadow-sm hover:underline">
        <MapPin aria-hidden className="size-3.5" /> Google Maps
      </a>
    </div>
  );
}
