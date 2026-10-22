import { DESTINATIONS } from "./trip-data";
export type AssistantMessage = { role: "user" | "assistant"; content: string };

export function appGuide(question: string): string {
  const q = question.toLowerCase();
  if (/login|log in|sign.?in|email|inbox|code|usc|shibboleth/.test(q)) return "Continue takes your USC email straight into this prototype without sending an email or code. The USC link opens the university portal separately, but USC approval is still needed to connect that login to TripMatch.";
  if (/mbti|personality|percent/.test(q)) return "MBTI is optional. Its percentage counts shared letters out of four: 0%, 25%, 50%, 75%, or 100%. Trip summaries average those comparisons across members who supplied a type. Unknown types stay unknown. Dates, destination and budget drive matching more strongly.";
  if (/chat|friend|message/.test(q)) return "Open a matched person's plan to find the traveler chat. Sample profiles have a device-only demo chat with no recipient. Messaging real classmates requires a verified sign-in and the team's chat database update.";
  if (/cancel|book|payment|official/.test(q)) return "A plan in this prototype is not a travel booking. It does not buy tickets or take payment. You can go back to Matches or choose Pass before accepting. Cancelling an accepted plan is not available yet.";
  const destination = Object.values(DESTINATIONS).flat().find((destination) => q.includes(destination.name.toLowerCase()));
  if (destination) return `For ${destination.name}, the prototype suggests: ${destination.activities.slice(0, 3).join(", ")}. Its sample cost range is $${destination.min}–$${destination.max} per person, not a live quote. ${destination.car ? "Discuss who can drive and how to share transport costs." : "Check local transport rather than assuming someone should bring a car."} Confirm current prices, availability and opening hours yourself.`;
  if (/budget|cheap|cost/.test(q)) return "Start with your total budget per person, including transport and accommodation. Compare it with your classmates before agreeing to a plan. The app's destination costs are sample estimates, not current prices.";
  if (/match|compatible/.test(q)) return "Choose a break, travel style, destination and budget. The app compares those preferences and dates, plus relevant car availability. Optional MBTI adds a small preference bonus. Sample profiles are labeled, so they aren't mistaken for real classmates.";
  return "I can help with trip ideas, budgets, matching, MBTI, sign-in or traveler chat. Tell me a destination and what you need, such as ‘Tokyo ideas’ or ‘How do matches work?’";
}
