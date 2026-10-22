import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const threadInput = z.object({ proposalId: z.string().uuid() });
const sendInput = threadInput.extend({ body: z.string().trim().min(1).max(1000), clientId: z.string().uuid() });

async function threadAccess(proposalId: string) {
  const { verifiedEmail } = await import("./trip-access.server");
  const email = await verifiedEmail(true);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: proposal, error } = await db.from("proposals").select("user_profile_id,match_profile_id,status").eq("id", proposalId).single();
  if (error || !proposal || !["proposed", "countered", "accepted"].includes(proposal.status)) throw new Error("Chat is unavailable for this plan.");
  const { data: people } = await db.from("trip_profiles").select("id,email,is_seed,first_name").in("id", [proposal.user_profile_id, proposal.match_profile_id]);
  const me = people?.find((person) => person.email.toLowerCase() === email);
  if (!me || people?.length !== 2 || people.some((person) => person.is_seed)) throw new Error("Chat is only available to the real travelers in this plan.");
  return { db, me, people };
}
export const listTripMessages = createServerFn({ method: "POST" }).inputValidator((data: unknown) => threadInput.parse(data)).handler(async ({ data }) => {
  const { db, me, people } = await threadAccess(data.proposalId);
  const { data: messages, error } = await db.from("trip_messages").select("id,author_profile_id,body,created_at").eq("proposal_id", data.proposalId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
  if (error) throw new Error("Chat needs the team's database update. Please contact the team.");
  return { me: me.id, messages: (messages ?? []).reverse().map((message) => ({ ...message, name: people.find((person) => person.id === message.author_profile_id)?.first_name ?? "Traveler" })) };
});
export const sendTripMessage = createServerFn({ method: "POST" }).inputValidator((data: unknown) => sendInput.parse(data)).handler(async ({ data }) => {
  const { db, me } = await threadAccess(data.proposalId);
  const { error } = await db.from("trip_messages").insert({ proposal_id: data.proposalId, author_profile_id: me.id, client_id: data.clientId, body: data.body });
  if (error && error.code !== "23505") throw new Error("Message was not sent. The chat database may need the team's update.");
  return { ok: true };
});
