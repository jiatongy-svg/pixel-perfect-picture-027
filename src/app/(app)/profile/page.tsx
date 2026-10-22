// Travel profile: a short summary card by default; ?edit=1 shows the full form.
import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import { getOnboardedViewer, photoUrls } from "@/lib/data";
import { ProfileForm } from "@/components/ProfileForm";
import { ProfileSummary } from "@/components/ProfileSummary";
import { Button, Notice, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ edit?: string; saved?: string }> }) {
  const { edit, saved } = await searchParams;
  const { supabase, userId, profile } = await getOnboardedViewer();
  const urls = await photoUrls(supabase, [profile.photo_path]);
  const photo = profile.photo_path ? urls[profile.photo_path] ?? null : null;
  const signOutButton = (
    <form action={signOut}>
      <Button variant="secondary" size="sm" type="submit"><LogOut aria-hidden className="size-4" /> Sign out</Button>
    </form>
  );

  if (edit) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Edit travel profile" subtitle="What classmates see on your match card."
          action={<Link href="/profile" className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text">Cancel</Link>} />
        <ProfileForm userId={userId} initial={profile} photoUrl={photo} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title="Travel profile" subtitle="What classmates see once you're matched." action={signOutButton} />
      {saved && <Notice tone="success">Profile saved.</Notice>}
      <ProfileSummary profile={profile} photoUrl={photo} />
    </div>
  );
}
