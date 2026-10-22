// The home URL just routes people to the right place.
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile, plan } = await getViewer();
  if (!profile?.completed) redirect("/onboarding");
  if (!plan) redirect("/plan");
  redirect("/matches");
}
