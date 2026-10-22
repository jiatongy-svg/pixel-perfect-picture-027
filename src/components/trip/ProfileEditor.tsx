import { MbtiPicker } from "./Personality";
import type { Mbti } from "@/lib/personality";
import { DEFAULT_DETAILS, PACE, RHYTHM, STAYS, type TravelerDetails } from "@/lib/traveler";
import { PrimaryButton } from "./ui";
const field = "mt-2 h-12 w-full rounded-xl border-2 border-border bg-card px-3";
export function ProfileEditor({ details, onChange, mbti, onMbti, onDone }: { details: TravelerDetails; onChange: (details: TravelerDetails) => void; mbti: Mbti | null; onMbti: (mbti: Mbti | null) => void; onDone: () => void }) {
  return <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); onDone(); }}>
    <h1 className="text-3xl font-extrabold">Your traveler profile</h1>
    <label className="block text-sm font-semibold">MSBA year<select className={field} value={details.year} onChange={(event) => onChange({ ...details, year: event.target.value as TravelerDetails["year"] })}><option>1st year</option><option>2nd year</option></select></label>
    <label className="block text-sm font-semibold">About you as a traveler <span className="font-normal text-muted-foreground">(optional)</span><textarea rows={3} maxLength={140} className="mt-2 w-full rounded-xl border-2 border-border bg-card p-3 font-normal" value={details.bio} onChange={(event) => onChange({ ...details, bio: event.target.value })} placeholder="A little about how you like to travel…" /><span className="block text-right text-xs font-normal text-muted-foreground">{details.bio.length}/140</span></label>
    <MbtiPicker value={mbti} onChange={onMbti} />
    <fieldset><legend className="font-semibold">Your pace</legend><p className="mt-1 text-sm text-muted-foreground">Easygoing leaves plenty of downtime. Balanced mixes activities and breaks. Packed days fits in as much as possible.</p><div className="mt-3 grid grid-cols-3 gap-2">{PACE.map((pace) => <button type="button" key={pace} aria-pressed={details.pace === pace} onClick={() => onChange({ ...details, pace })} className={`rounded-xl border-2 px-2 py-3 text-sm ${details.pace === pace ? "border-primary bg-secondary" : "border-border bg-card"}`}>{pace}</button>)}</div></fieldset>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Daily rhythm<select className={field} value={details.rhythm} onChange={(event) => onChange({ ...details, rhythm: event.target.value as TravelerDetails["rhythm"] })}>{RHYTHM.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-semibold">Preferred stay<select className={field} value={details.stay} onChange={(event) => onChange({ ...details, stay: event.target.value as TravelerDetails["stay"] })}>{STAYS.map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <p className="text-xs text-muted-foreground">Your identity and bio stay hidden while others browse plans. Confirmed trip members can see your profile.</p>
    <PrimaryButton type="submit">Save profile on this device</PrimaryButton>
  </form>;
}
