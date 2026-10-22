import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import { getOnboardedViewer, photoUrls } from "@/lib/data";
import { ProfileForm } from "@/components/ProfileForm";
import { Button, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { supabase, userId, profile } = await getOnboardedViewer();
  const urls = await photoUrls(supabase, [profile.photo_path]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Travel profile"
        subtitle="What classmates see on your match card."
        action={
          <form action={signOut}>
            <Button variant="secondary" size="sm" type="submit"><LogOut aria-hidden className="size-4" /> Sign out</Button>
          </form>
        }
      />
      <ProfileForm userId={userId} initial={profile} photoUrl={profile.photo_path ? urls[profile.photo_path] ?? null : null} />
    </div>
  );
}
