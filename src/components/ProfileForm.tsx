"use client";
// ============================================================================
// Travel profile form — who you are as a traveler. Separate from any one trip.
// Sections: basics + photo, travel experience & style, personal equipment.
// ============================================================================
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Camera, Car } from "lucide-react";
import { saveProfile } from "@/app/actions";
import { EQUIPMENT, EXPERIENCE, LODGING, PACE, SCHEDULE, type EquipmentId, type LodgingId } from "@/lib/catalog";
import { PROFILE_LIMITS } from "@/lib/constants";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { MBTI_TYPES, type Mbti, type Profile } from "@/lib/types";
import { Avatar, Button, Card, Chip, Field, Group, Notice, OptionCard, inputBase, inputClass } from "@/components/ui";

type Draft = Omit<Profile, "id" | "completed">;

const EMPTY: Draft = {
  display_name: "", msba_year: "1st", photo_path: null, bio: "", travel_experience: "some", pace: "balanced",
  schedule: "flexible", lodging_prefs: [], has_car: false, car_seats: 0, equipment: [], mbti: null,
};

// `next`: where to go after saving (onboarding). Without it, saving returns to
// the short profile summary.
export function ProfileForm({ userId, initial, photoUrl, next }: { userId: string; initial: Profile | null; photoUrl: string | null; next?: string }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial ? { ...EMPTY, ...initial } : EMPTY);
  const [preview, setPreview] = useState<string | null>(photoUrl);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // Upload the photo straight to Supabase Storage (private bucket, own folder only).
  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setErrors((e) => ({ ...e, photo_path: "" }));
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setErrors((e) => ({ ...e, photo_path: "Use a JPG, PNG or WebP image" }));
    if (file.size > PROFILE_LIMITS.maxPhotoBytes) return setErrors((e) => ({ ...e, photo_path: "Photos must be 2 MB or smaller" }));
    setUploading(true);
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error } = await createBrowserSupabase().storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (error) return setErrors((e) => ({ ...e, photo_path: "Upload failed. Try again." }));
    set("photo_path", path);
    setPreview(URL.createObjectURL(file));
  }

  function submit() {
    setResult(null);
    startTransition(async () => {
      const r = await saveProfile({ ...d, car_seats: d.has_car ? d.car_seats : 0 });
      if (!r.ok) {
        setErrors(r.fields ?? {});
        setResult({ tone: "error", text: r.error });
        return;
      }
      setErrors({});
      router.push(next ?? "/profile?saved=1");
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] || undefined;

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">The basics</h2>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <Avatar name={d.display_name || "You"} url={preview} size={64} />
            <div className="flex min-w-0 flex-col gap-1">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="photo" onChange={(e) => onPhoto(e.target.files?.[0])} />
              <Button type="button" variant="secondary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                <Camera aria-hidden className="size-4" /> {d.photo_path ? "Change photo" : "Add a photo"}
              </Button>
              <p className="text-xs text-muted">Optional. Only pilot classmates can see it. Max 2 MB.</p>
              {err("photo_path") && <p className="text-sm text-danger-text" role="alert">{err("photo_path")}</p>}
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="display_name" label="Name classmates know you by" error={err("display_name")}>
              <input id="display_name" className={inputClass} maxLength={PROFILE_LIMITS.maxName} autoComplete="given-name" value={d.display_name}
                onChange={(e) => set("display_name", e.target.value)} aria-invalid={!!err("display_name")} aria-describedby={err("display_name") ? "display_name-error" : undefined} />
            </Field>
            <Group legend="MSBA year" error={err("msba_year")}>
              <div role="radiogroup" aria-label="MSBA year" className="grid grid-cols-2 gap-2">
                <OptionCard selected={d.msba_year === "1st"} title="1st year" onSelect={() => set("msba_year", "1st")} />
                <OptionCard selected={d.msba_year === "2nd"} title="2nd year" onSelect={() => set("msba_year", "2nd")} />
              </div>
            </Group>
          </div>
          <Field id="bio" label="A line about you as a traveler" optional error={err("bio")} hint={`${d.bio.length}/${PROFILE_LIMITS.maxBio}`}>
            <textarea id="bio" rows={2} maxLength={PROFILE_LIMITS.maxBio} className={`${inputClass} h-auto py-2`} value={d.bio}
              placeholder="Will drive anywhere for good tacos. Up for sunrise hikes, not 5am alarms."
              onChange={(e) => set("bio", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Travel style</h2>
        <div className="flex flex-col gap-5">
          <Group legend="Travel experience">
            <div role="radiogroup" aria-label="Travel experience" className="grid gap-2 sm:grid-cols-3">
              {EXPERIENCE.map((x) => <OptionCard key={x.id} selected={d.travel_experience === x.id} title={x.label} description={x.description} onSelect={() => set("travel_experience", x.id)} />)}
            </div>
          </Group>
          <Group legend="Pace">
            <div role="radiogroup" aria-label="Pace" className="grid gap-2 sm:grid-cols-3">
              {PACE.map((x) => <OptionCard key={x.id} selected={d.pace === x.id} title={x.label} description={x.description} onSelect={() => set("pace", x.id)} />)}
            </div>
          </Group>
          <Group legend="Daily rhythm">
            <div role="radiogroup" aria-label="Daily rhythm" className="grid grid-cols-3 gap-2">
              {SCHEDULE.map((x) => <OptionCard key={x.id} selected={d.schedule === x.id} title={x.label} onSelect={() => set("schedule", x.id)} />)}
            </div>
          </Group>
          <Field id="mbti" label="MBTI" optional hint="Shown to matches for fun. It never changes your match score.">
            <select id="mbti" className={`${inputBase} w-full sm:w-64`} value={d.mbti ?? ""} onChange={(e) => set("mbti", (e.target.value || null) as Mbti | null)}>
              <option value="">Not sure / prefer not to say</option>
              {MBTI_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Group legend="Where you like to stay" hint="Pick any that you're happy with.">
            <div className="flex flex-wrap gap-2">
              {LODGING.map((x) => (
                <Chip key={x.id} selected={d.lodging_prefs.includes(x.id)} onClick={() => set("lodging_prefs", toggle<LodgingId>(d.lodging_prefs, x.id))}>{x.label}</Chip>
              ))}
            </div>
          </Group>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">What you own</h2>
        <p className="mb-4 text-sm text-muted">Your personal gear. For each trip you'll choose what you're willing to bring.</p>
        <div className="flex flex-col gap-5">
          <Group legend="Car" error={err("car_seats")}>
            <div className="flex flex-wrap items-center gap-3">
              <Chip selected={d.has_car} onClick={() => set("has_car", !d.has_car)}>
                <Car aria-hidden className="size-4" /> I have a car
              </Chip>
              {d.has_car && (
                <label className="flex items-center gap-2 text-sm">
                  Passenger seats
                  <input type="number" min={1} max={PROFILE_LIMITS.maxSeats} inputMode="numeric" className={`${inputBase} w-20`} value={d.car_seats || ""}
                    onChange={(e) => set("car_seats", Math.max(0, Math.min(PROFILE_LIMITS.maxSeats, Number(e.target.value) || 0)))} aria-invalid={!!err("car_seats")} />
                </label>
              )}
            </div>
          </Group>
          <Group legend="Gear">
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT.map((x) => (
                <Chip key={x.id} selected={d.equipment.includes(x.id)} onClick={() => set("equipment", toggle<EquipmentId>(d.equipment, x.id))}>{x.label}</Chip>
              ))}
            </div>
          </Group>
        </div>
      </Card>

      {result && <Notice tone={result.tone}>{result.text}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={uploading} className="w-full sm:w-auto">{next ? "Save and continue" : "Save profile"}</Button>
      </div>
    </form>
  );
}
