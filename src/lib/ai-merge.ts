// ============================================================================
// ai-merge.ts — OPTIONAL. Off unless ENABLE_AI_MERGE=true and ANTHROPIC_API_KEY
// is set on the server. The app works fully without it.
//
// What it does: asks Claude to pick the destination/dates from the options
// the rules already proved feasible, and to write a nicer day-by-day outline.
// Safety rails:
//   * Runs on the server only; the key never reaches the browser.
//   * Sends the minimum: no names, emails, notes or photos — people are
//     "Traveler 1", "Traveler 2", with only vibes, pace and the feasible options.
//   * The reply must match a strict JSON schema, AND we re-check it against
//     every hard constraint with the same rules engine. Anything off -> we use
//     the rules-based plan and tell the user.
// ============================================================================
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { vibeLabel } from "./catalog";
import { AI_MODEL, AI_TIMEOUT_MS } from "./constants";
import { addDays, daysInclusive } from "./dates";
import { dateFit, destinationFit } from "./feasibility";
import { mergePlans, type MergedTrip } from "./merge";
import { placeLabel, resolveDestination } from "./places";
import type { Person } from "./types";

const AiPlan = z.object({
  destination_id: z.string(),
  start_date: z.string(),
  summary: z.string(),
  outline: z.array(z.string()),
});

export const aiEnabled = () => process.env.ENABLE_AI_MERGE === "true" && !!process.env.ANTHROPIC_API_KEY;

export async function tryAiMerge(people: Person[], rules: MergedTrip, today: string): Promise<MergedTrip> {
  if (!aiEnabled()) return rules;
  const fallback = (why: string): MergedTrip => ({ ...rules, notice: `AI suggestion unavailable (${why}), so this plan uses the standard rules.` });

  const plans = people.map((p) => p.plan);
  const fit = dateFit(plans, today);
  const options = destinationFit(plans).common.slice(0, 15).map((c) => ({ id: c.key, name: placeLabel(c), good_for: resolveDestination(c).vibes }));
  if (!fit.overlap) return rules;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
    const response = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(AiPlan) },
      system:
        "You plan short trips for graduate students. Choose only from the options given. Write the outline as one short line per day, " +
        "using general activity themes. Never invent prices, opening hours, reservations, or specific businesses.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            travelers: people.map((p, i) => ({ label: `Traveler ${i + 1}`, vibes: p.plan.vibes.map(vibeLabel), pace: p.profile.pace })),
            destination_options: options,
            trip_days: rules.days,
            start_date_must_be_between: [fit.overlap.start, addDays(fit.overlap.end, -(rules.days - 1))],
            current_suggestion: { destination_id: rules.destination.id, start_date: rules.dates.start },
            task: `Pick destination_id and start_date, write a one-sentence summary, and exactly ${rules.days} outline lines.`,
          }),
        },
      ],
    });
    if (response.stop_reason === "refusal") return fallback("declined");
    const out = response.parsed_output;
    if (!out) return fallback("unreadable reply");

    // Re-check everything with the rules engine. Same length as the rules plan.
    const end = addDays(out.start_date, rules.days - 1);
    const checked = mergePlans(people, today, { destinationId: out.destination_id, start: out.start_date, end });
    if (!checked.feasible || daysInclusive(checked.dates) !== rules.days || out.outline.length !== rules.days) return fallback("it didn't fit everyone's constraints");

    const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
    return {
      ...checked,
      summary: clean(out.summary, 200) || checked.summary,
      outline: checked.outline.map((d, i) => ({ ...d, title: clean(out.outline[i], 160) || d.title })),
      decisions: [...checked.decisions.filter((x) => !x.includes("requested in a counter")), "Destination, dates and outline suggested by AI, then checked against everyone's constraints."],
      source: "ai",
    };
  } catch {
    // Never log the request or key; a short generic reason is enough.
    return fallback("the AI service didn't respond");
  }
}
