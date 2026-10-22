export const MBTI_TYPES = ["ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP", "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ"] as const;
export type Mbti = typeof MBTI_TYPES[number];
export const isMbti = (value: unknown): value is Mbti => typeof value === "string" && (MBTI_TYPES as readonly string[]).includes(value);

// A transparent preference comparison, not a prediction of relationship success.
export function mbtiSimilarity(a?: string | null, b?: string | null): number | null {
  if (!isMbti(a) || !isMbti(b)) return null;
  return [...a].filter((letter, index) => letter === b[index]).length * 25;
}
export function groupMbti(members: { id: string; first_name: string; mbti?: Mbti | null }[]) {
  return members.map((member) => {
    const scores = members.filter((other) => other.id !== member.id)
      .map((other) => mbtiSimilarity(member.mbti, other.mbti)).filter((score): score is number => score !== null);
    return { ...member, percent: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null, comparedWith: scores.length };
  });
}
