import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isUscEmail, uscSsoEnabled } from "./sign-in";

// The existing prototype mode remains unchanged. SSO mode verifies each request
// on the server, so changing browser state cannot impersonate another student.
export async function verifiedEmail(required = false): Promise<string | null> {
  if (!uscSsoEnabled && !required) return null;
  const header = getRequest().headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Please sign in with USC.");
  const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
  const user = data.user;
  if (error || !user?.email || !user.email_confirmed_at || !isUscEmail(user.email)) {
    throw new Error("Please sign in with your USC account.");
  }
  return user.email.toLowerCase();
}

export async function requireProfileOwner(profileId: string) {
  const email = await verifiedEmail();
  if (!email) return;
  const { data, error } = await supabaseAdmin.from("trip_profiles").select("email").eq("id", profileId).single();
  if (error || data?.email.toLowerCase() !== email) throw new Error("You can only change your own trip.");
}

export async function requireProposalAccess(proposalId: string, ownerOnly: boolean) {
  const email = await verifiedEmail();
  if (!email) return;
  const { data: proposal, error } = await supabaseAdmin.from("proposals").select("user_profile_id, match_profile_id").eq("id", proposalId).single();
  if (error || !proposal) throw new Error("Trip not found.");
  const ids = ownerOnly ? [proposal.user_profile_id] : [proposal.user_profile_id, proposal.match_profile_id];
  const { data: profiles } = await supabaseAdmin.from("trip_profiles").select("email").in("id", ids);
  if (!profiles?.some((profile) => profile.email.toLowerCase() === email)) throw new Error("You do not have access to this trip.");
}
