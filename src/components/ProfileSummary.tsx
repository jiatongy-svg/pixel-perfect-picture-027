// A short "brief" of a saved travel profile: photo, name, year, a line about
// them, and their travel style as compact tags. Shown on /profile after saving.
import Link from "next/link";
import { Car, Pencil } from "lucide-react";
import { EXPERIENCE, LODGING, PACE, SCHEDULE, equipmentLabel, vibeLabel } from "@/lib/catalog";
import { prefLabel } from "@/lib/groupsize";
import type { Profile } from "@/lib/types";
import { Avatar, Badge, Card } from "@/components/ui";

const label = <T extends { id: string; label: string }>(list: readonly T[], id: string) => list.find((x) => x.id === id)?.label ?? id;

export function ProfileSummary({ profile, photoUrl, contact }: { profile: Profile; photoUrl: string | null; contact?: string }) {
  const style = [
    label(EXPERIENCE, profile.travel_experience),
    `${label(PACE, profile.pace)} pace`,
    label(SCHEDULE, profile.schedule),
    ...profile.lodging_prefs.map((l) => label(LODGING, l)),
    ...(profile.vibes ?? []).map((v) => vibeLabel(v).replace(/^./, (c) => c.toUpperCase())),
  ];
  const size = (pref: string, strict: boolean) => `${prefLabel(pref as never)}${pref !== "any" ? (strict ? " (strict)" : " (flexible)") : ""}`;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={profile.display_name} url={photoUrl} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold break-words">{profile.display_name}</h2>
          <p className="text-sm text-muted">MSBA {profile.msba_year} year{profile.mbti ? ` · ${profile.mbti}` : ""}</p>
        </div>
        <Link href="/profile?edit=1" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border-interactive bg-surface-raised px-3 text-sm font-medium transition-colors duration-150 hover:bg-surface-hover active:bg-surface-active">
          <Pencil aria-hidden className="size-4" /> Edit
        </Link>
      </div>
      {profile.bio && <p className="break-words">{profile.bio}</p>}
      <div className="flex flex-wrap gap-1.5">
        {style.map((s) => <Badge key={s}>{s}</Badge>)}
      </div>
      <p className="text-sm text-muted"><span className="font-medium text-text">Group size:</span> weekends {size(profile.group_pref_weekend, profile.group_strict_weekend)} · long breaks {size(profile.group_pref_long, profile.group_strict_long)}</p>
      {(profile.has_license || profile.can_rent) && <p className="text-sm text-muted"><span className="font-medium text-text">Driving:</span> {profile.can_rent ? "Has a license and can rent a car" : "Has a driver's license"}</p>}
      {contact && <p className="text-sm text-muted"><span className="font-medium text-text">Contact for trip-mates:</span> {contact}</p>}
      {(profile.has_car || profile.equipment.length > 0) && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span className="font-medium text-text">Owns:</span>
          {profile.has_car && <span className="inline-flex items-center gap-1"><Car aria-hidden className="size-4" /> Car ({profile.car_seats} passenger {profile.car_seats === 1 ? "seat" : "seats"})</span>}
          {profile.equipment.map(equipmentLabel).join(", ")}
        </p>
      )}
    </Card>
  );
}
