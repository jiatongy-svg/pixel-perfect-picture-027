// Explore is now called Discover.
import { redirect } from "next/navigation";
export default async function OldExplorePlan({ params }: { params: Promise<{ planId: string }> }) {
  redirect(`/discover/plan/${(await params).planId}`);
}
