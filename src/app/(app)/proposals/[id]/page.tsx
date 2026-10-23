// Proposals are now "My trips".
import { redirect } from "next/navigation";
export default async function OldProposal({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/trips/${(await params).id}`);
}
