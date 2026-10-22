import { describe, expect, it } from "vitest";
import { appGuide } from "@/lib/assistant";
describe("Assistant app guidance", () => {
  it("explains email-free entry and pending USC approval accurately", () => {
    expect(appGuide("How do I log in?")).toContain("without sending an email or code");
    expect(appGuide("How do I log in?")).toContain("approval");
  });
  it("does not present preset travel costs as live quotes", () => {
    expect(appGuide("Tokyo ideas")).toContain("not a live quote");
  });
  it("does not claim MBTI predicts compatibility or that demo chat reaches friends", () => {
    expect(appGuide("MBTI")).toContain("Unknown types stay unknown");
    expect(appGuide("Chat with friends")).toContain("no recipient");
  });
});
