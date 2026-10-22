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

export async function currentActor() {
  const hasToken = !!getRequest().headers.get("authorization");
  if (uscSsoEnabled || hasToken) return { email: await verifiedEmail(true), profileId: null };
  const { deviceProfile } = await import("./device-session.server");
  return { email: null, profileId: await deviceProfile() };
}

export async function requireProfileOwner(profileId: string) {
  const actor = await currentActor();
  if (actor.profileId === profileId) return;
  if (!actor.email) throw new Error("You can only change your own trip. Please sign in again.");
  const { data, error } = await supabaseAdmin.from("trip_profiles").select("email").eq("id", profileId).single();
  if (error || data?.email.toLowerCase() !== actor.email) throw new Error("You can only change your own trip.");
}

export async function requireProposalAccess(proposalId: string, ownerOnly: boolean) {
  const actor = await currentActor();
  if (!actor.email && !actor.profileId) throw new Error("Please sign in to view this plan.");
  const { data: proposal, error } = await supabaseAdmin.from("proposals").select("user_profile_id, match_profile_id").eq("id", proposalId).single();
  if (error || !proposal) throw new Error("Trip not found.");
  const ids = ownerOnly ? [proposal.user_profile_id] : [proposal.user_profile_id, proposal.match_profile_id];
  if (actor.profileId && ids.includes(actor.profileId)) return actor.profileId;
  const { data: profiles } = await supabaseAdmin.from("trip_profiles").select("id,email").in("id", ids);
  const member = profiles?.find((profile) => profile.email.toLowerCase() === actor.email);
  if (!member) throw new Error("You do not have access to this trip.");
  return member.id;
}
