import { describe, expect, it } from "vitest";
import { groupMbti, mbtiSimilarity } from "@/lib/personality";
import { scoreMatch } from "@/lib/matching";
import type { TripProfile } from "@/lib/trip-data";
const profile: TripProfile = { id: "a", email: "a@usc.edu", first_name: "A", msba_year: "2027", break_id: "winter", vibes: ["Relaxed"], destinations: ["Tokyo"], start_date: "2026-12-26", end_date: "2027-01-02", budget: "700plus", gear: [], mbti: "INTJ" };
describe("MBTI preference comparison", () => {
  it("keeps unknown/invalid types unknown instead of inventing percentages", () => {
    expect(mbtiSimilarity("INTJ", null)).toBeNull();
    expect(mbtiSimilarity("XXXX", "INTJ")).toBeNull();
    expect(mbtiSimilarity("INTJ", "ENFP")).toBe(25);
  });
  it("averages each traveler against known other members only", () => {
    const result = groupMbti([{ id: "a", first_name: "A", mbti: "INTJ" }, { id: "b", first_name: "B", mbti: "ENTJ" }, { id: "c", first_name: "C", mbti: "ENFP" }, { id: "d", first_name: "D" }]);
    expect(result.map((person) => person.percent)).toEqual([50, 63, 38, null]);
    expect(result.map((person) => person.comparedWith)).toEqual([2, 2, 2, 0]);
  });
  it("does not match across different breaks just because MBTI is identical", () => {
    expect(scoreMatch(profile, { ...profile, id: "b", break_id: "spring" })).toBeNull();
  });
  it("adds no more than five points and does not boost an otherwise unqualified match", () => {
    const other = { ...profile, id: "b" };
    expect(scoreMatch(profile, other)!.score - scoreMatch({ ...profile, mbti: null }, other)!.score).toBe(5);
    const poor = { ...other, vibes: ["Adventure"] as TripProfile["vibes"], destinations: ["Seattle"], budget: "under300" as const, start_date: "2026-11-01" };
    expect(scoreMatch(profile, poor)!.score).toBe(0);
  });
});
