// Proposals are now "My trips".
import { redirect } from "next/navigation";
export default function OldProposals() {
  redirect("/trips");
}
