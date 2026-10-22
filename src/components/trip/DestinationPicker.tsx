import { useState } from "react";
import { mapUrl } from "@/lib/traveler";
import { DESTINATIONS } from "@/lib/trip-data";
export function DestinationPicker({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [usOnly, setUsOnly] = useState(false);
  const suggestions = [...new Set(Object.values(DESTINATIONS).flat().map((place) => place.name))];
  function add() {
    const value = draft.trim();
    if (!value || value.length > 80 || values.length >= 5) return;
    if (!values.some((existing) => existing.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
    setDraft("");
  }
  return <div className="space-y-3">
    <label className="block text-sm font-semibold">Destination<input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} maxLength={80} list="trip-place-options" placeholder="Type a city or place, e.g. San Diego" className="mt-2 h-14 w-full rounded-xl border-2 border-border bg-card px-3" /></label>
    <datalist id="trip-place-options">{suggestions.map((place) => <option key={place} value={place} />)}</datalist>
    <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={!draft.trim() || values.length >= 5} onClick={add} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">Add destination</button><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={usOnly} onChange={(event) => setUsOnly(event.target.checked)} />Search US locations</label></div>
    {!!draft.trim() && <a href={mapUrl(draft, usOnly)} target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold text-primary underline">Find “{draft.trim()}” on Google Maps</a>}
    <ul className="space-y-2">{values.map((place, index) => <li key={place} className="flex items-center gap-3 rounded-xl bg-secondary p-3"><span className="min-w-0 flex-1 break-words text-sm font-semibold">{index + 1}. {place}</span><a href={mapUrl(place, usOnly)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">Map</a><button type="button" aria-label={`Remove ${place}`} onClick={() => onChange(values.filter((value) => value !== place))} className="px-2">×</button></li>)}</ul>
    <p className="text-xs text-muted-foreground">Add up to five destinations. Google Maps opens separately so you can check the exact place. Selecting a map result does not automatically update this form.</p>
  </div>;
}
