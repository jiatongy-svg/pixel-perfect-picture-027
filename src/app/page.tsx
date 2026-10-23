// The home URL just routes people to the right place.
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile, plans } = await getViewer();
  if (!profile?.completed) redirect("/onboarding");
  // No plan -> Discover (join a trip that's happening); with a plan -> Match.
  redirect(plans.some((p) => p.status === "active") ? "/matches" : "/discover");
}
