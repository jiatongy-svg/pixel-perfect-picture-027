import { describe, expect, it } from "vitest";
import { demoCodeMatches, demoConfig, isDemoEmail } from "@/lib/demo-signin";

const env = { DEMO_SIGNIN_EMAILS: "Demo1@usc.edu, demo2@usc.edu", DEMO_SIGNIN_CODE: "48201937" };

describe("demo sign-in code", () => {
  it("is off unless both variables are set, and the code is 8 digits", () => {
    expect(demoConfig({})).toBeNull();
    expect(demoConfig({ DEMO_SIGNIN_EMAILS: "a@usc.edu" })).toBeNull();
    expect(demoConfig({ DEMO_SIGNIN_EMAILS: "a@usc.edu", DEMO_SIGNIN_CODE: "123456" })).toBeNull(); // too short to be safe
    expect(demoConfig(env)?.emails.size).toBe(2);
  });
  it("only works for the listed demo accounts, with the exact code", () => {
    expect(isDemoEmail("demo1@usc.edu", env)).toBe(true);
    expect(isDemoEmail("someone@usc.edu", env)).toBe(false);
    expect(demoCodeMatches(" demo1@USC.edu ", "48201937", env)).toBe(true);
    expect(demoCodeMatches("demo1@usc.edu", "48201938", env)).toBe(false);
    expect(demoCodeMatches("someone@usc.edu", "48201937", env)).toBe(false); // the code is useless for anyone else
    expect(demoCodeMatches("demo1@usc.edu", "48201937", {})).toBe(false); // off
  });
});
