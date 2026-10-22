import { groupMbti, MBTI_TYPES, type Mbti } from "@/lib/personality";

export function MbtiPicker({ value, onChange }: { value: Mbti | null; onChange: (value: Mbti | null) => void }) {
  return <div className="mt-6">
    <label htmlFor="mbti" className="block text-sm font-semibold">MBTI (optional)</label>
    <select id="mbti" value={value ?? ""} onChange={(event) => onChange((event.target.value || null) as Mbti | null)} className="mt-2 h-12 w-full rounded-xl border-2 border-border bg-card px-3">
      <option value="">Not sure / prefer not to say</option>
      {MBTI_TYPES.map((type) => <option key={type}>{type}</option>)}
    </select>
    <p className="mt-2 text-xs text-muted-foreground">A small matching preference. Dates, destination and budget matter more.</p>
  </div>;
}

export function GroupPersonality({ members }: { members: { id: string; first_name: string; mbti?: Mbti | null }[] }) {
  const summary = groupMbti(members);
  return <section className="mt-6 rounded-2xl border border-border bg-card p-4" aria-label="Trip MBTI comparison">
    <h2 className="text-lg font-bold">MBTI preference match</h2>
    <p className="mt-1 text-xs text-muted-foreground">Shared letters out of four, averaged against other trip members with an MBTI. This is not a prediction of travel compatibility.</p>
    <ul className="mt-3 space-y-2">{summary.map((member) => <li key={member.id} className="flex justify-between gap-3 text-sm">
      <span>{member.first_name} {member.mbti ? `(${member.mbti})` : "(not provided)"}</span>
      <span className="shrink-0 font-semibold">{member.percent === null ? "Not enough data" : `${member.percent}% · ${member.comparedWith} compared`}</span>
    </li>)}</ul>
  </section>;
}
