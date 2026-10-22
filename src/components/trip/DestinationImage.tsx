import { useEffect, useState } from "react";
const cache = new Map<string, { url: string; file: string } | null>();
const article: Record<string, string> = { "Big Bear (ski)": "Big Bear Lake, California", "Zion & Bryce": "Zion National Park", "Hawaii (Oahu)": "Oahu", "Grand Canyon & Sedona": "Grand Canyon", "Malibu & El Matador Beach": "El Matador State Beach", "Joshua Tree": "Joshua Tree National Park", "Yosemite": "Yosemite National Park" };
export function DestinationImage({ destination }: { destination: string }) {
  const title = article[destination] ?? destination;
  const [photo, setPhoto] = useState<{ url: string; file: string } | null>(cache.get(title) ?? null);
  useEffect(() => {
    let active = true;
    if (cache.has(title)) { setPhoto(cache.get(title) ?? null); return; }
    const abort = new AbortController();
    const query = new URLSearchParams({ action: "query", format: "json", origin: "*", prop: "pageimages", titles: title, piprop: "thumbnail|name", pithumbsize: "800", pilicense: "free", redirects: "1" });
    fetch(`https://en.wikipedia.org/w/api.php?${query}`, { signal: abort.signal }).then((response) => response.json()).then((data) => {
      const pages = Object.values(data.query?.pages ?? {}) as { thumbnail?: { source?: string }; pageimage?: string }[];
      const page = pages.find((item) => /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(item.thumbnail?.source ?? ""));
      const result = page?.thumbnail?.source && page.pageimage ? { url: page.thumbnail.source, file: page.pageimage } : null;
      cache.set(title, result); if (active) setPhoto(result);
    }).catch(() => { if (active) setPhoto(null); });
    return () => { active = false; abort.abort(); };
  }, [title]);
  return <div className="relative mb-3 overflow-hidden rounded-xl bg-secondary">
    {photo ? <><img src={photo.url} alt={`View of ${title}`} loading="lazy" onError={() => setPhoto(null)} className="h-40 w-full object-cover" /><a href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(photo.file)}`} target="_blank" rel="noopener noreferrer" className="absolute right-1 bottom-1 rounded bg-card px-2 py-1 text-[10px] text-primary">Photo source</a></> : <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">{destination}<br />Destination photo unavailable</div>}
  </div>;
}
