import { createServerFn } from "@tanstack/react-start";
import { buildItinerary, mergeRules, planOf, rankMatches } from "./matching";
import type { MergedPlan, Plan, TripProfile } from "./trip-data";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const toProfile = (r: Record<string, unknown>) => r as unknown as TripProfile;

export const saveProfile = createServerFn({ method: "POST" })
  .inputValidator((d: Omit<TripProfile, "id">) => {
    if (!/^[^@\s]+@usc\.edu$/i.test(d.email)) throw new Error("Use a @usc.edu email");
    return d;
  })
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row, error } = await db
      .from("trip_profiles")
      .upsert({ ...data, email: data.email.toLowerCase(), is_seed: false }, { onConflict: "email" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toProfile(row);
  });

export const getMatches = createServerFn({ method: "POST" })
  .inputValidator((d: { profileId: string }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: me } = await db.from("trip_profiles").select().eq("id", data.profileId).single();
    if (!me) throw new Error("Profile not found");
    const { data: pool } = await db.from("trip_profiles").select().eq("break_id", me.break_id).eq("is_seed", true);
    return { me: toProfile(me), matches: rankMatches(toProfile(me), (pool ?? []).map(toProfile)) };
  });

async function aiMerge(me: TripProfile, them: TripProfile, rules: MergedPlan, override?: Partial<Plan>): Promise<MergedPlan | null> {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions:
          "You merge two student travel plans into one compromise. Keep the destination and dates of the proposed draft unless clearly better. Return each change with a friendly one-line reason (max 14 words) that references both people. Dates in YYYY-MM-DD.",
        input: JSON.stringify({
          me: { name: "You", plan: { ...planOf(me), ...override }, vibes: me.vibes, ranked: me.destinations, budget: me.budget, gear: me.gear },
          them: { name: them.first_name, plan: planOf(them), vibes: them.vibes, ranked: them.destinations, budget: them.budget, gear: them.gear },
          user_locked: override ?? null,
          draft: rules,
        }),
        text: {
          format: {
            type: "json_schema",
            name: "merged_plan",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["destination", "start_date", "end_date", "summary", "changes"],
              properties: {
                destination: { type: "string" },
                start_date: { type: "string" },
                end_date: { type: "string" },
                summary: { type: "string" },
                changes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["field", "from", "to", "reason"],
                    properties: { field: { type: "string" }, from: { type: "string" }, to: { type: "string" }, reason: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      }),
    });
    if (!res.ok || !res.body) {
      console.error("AI merge failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta;
        } catch {}
      }
    }
    const out = JSON.parse(text) as MergedPlan;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(out.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(out.end_date)) return null;
    if (override?.destination) out.destination = override.destination;
    if (override?.start_date) out.start_date = override.start_date;
    if (override?.end_date) out.end_date = override.end_date;
    return out;
  } catch (e) {
    console.error("AI merge error", e);
    return null;
  }
}

export const proposeMerge = createServerFn({ method: "POST" })
  .inputValidator((d: { profileId: string; matchId: string; override?: Partial<Plan> | undefined }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows } = await db.from("trip_profiles").select().in("id", [data.profileId, data.matchId]);
    const me = rows?.find((r) => r.id === data.profileId);
    const them = rows?.find((r) => r.id === data.matchId);
    if (!me || !them) throw new Error("Profile not found");
    const rules = mergeRules(toProfile(me), toProfile(them), data.override);
    const ai = await aiMerge(toProfile(me), toProfile(them), rules, data.override);
    const merged = ai ?? rules;
    const { data: prop, error } = await db
      .from("proposals")
      .insert({
        user_profile_id: me.id,
        match_profile_id: them.id,
        merged: merged as never,
        source: ai ? "ai" : "rules",
        status: data.override ? "countered" : "proposed",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { proposalId: prop.id, merged, source: prop.source, me: toProfile(me), them: toProfile(them) };
  });

export const decide = createServerFn({ method: "POST" })
  .inputValidator((d: { proposalId: string; status: "accepted" | "passed" }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("proposals").update({ status: data.status, updated_at: new Date().toISOString() }).eq("id", data.proposalId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getItinerary = createServerFn({ method: "POST" })
  .inputValidator((d: { proposalId: string }) => d)
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: prop } = await db.from("proposals").select().eq("id", data.proposalId).single();
    if (!prop) throw new Error("Trip not found");
    const { data: rows } = await db.from("trip_profiles").select().in("id", [prop.user_profile_id, prop.match_profile_id]);
    const travelers = [prop.user_profile_id, prop.match_profile_id].map((id) => toProfile(rows!.find((r) => r.id === id)!));
    const merged = prop.merged as unknown as MergedPlan;
    return { status: prop.status, merged, travelers, itinerary: buildItinerary(travelers[0]!.break_id, merged, travelers) };
  });
