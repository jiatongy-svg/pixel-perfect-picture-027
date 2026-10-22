import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enabled: { value: true }, header: { value: "Bearer test-token" as string | null }, getUser: vi.fn(), single: vi.fn(), select: vi.fn(), eq: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/sign-in", () => ({ get uscSsoEnabled() { return mocks.enabled.value; }, isUscEmail: (email: string) => /^[^@\s]+@usc\.edu$/i.test(email) }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ headers: { get: () => mocks.header.value } }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
import { requireProfileOwner, verifiedEmail } from "@/lib/trip-access.server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.value = true;
  mocks.header.value = "Bearer test-token";
  mocks.getUser.mockResolvedValue({ data: { user: { email: "student@usc.edu", email_confirmed_at: "2026-10-22" } }, error: null });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ single: mocks.single });
});
describe("SSO request access", () => {
  it("rejects anonymous requests even if the browser has an email", async () => {
    mocks.header.value = null;
    await expect(verifiedEmail()).rejects.toThrow("Please sign in with USC");
  });
  it("rejects an unverified or non-USC identity", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { email: "student@usc.edu", email_confirmed_at: null } }, error: null });
    await expect(verifiedEmail()).rejects.toThrow("USC account");
  });
  it("prevents a signed-in student from using someone else's profile", async () => {
    mocks.single.mockResolvedValue({ data: { email: "someoneelse@usc.edu" }, error: null });
    await expect(requireProfileOwner("other-profile")).rejects.toThrow("your own trip");
    expect(mocks.getUser).toHaveBeenCalledWith("test-token");
  });
  it("allows the verified profile owner", async () => {
    mocks.single.mockResolvedValue({ data: { email: "student@usc.edu" }, error: null });
    await expect(requireProfileOwner("my-profile")).resolves.toBeUndefined();
  });
  it("requires a verified session for real messages even when prototype access is enabled", async () => {
    mocks.enabled.value = false;
    mocks.header.value = null;
    await expect(verifiedEmail(true)).rejects.toThrow("Please sign in with USC");
  });
  it("preserves the original prototype mode when SSO is off", async () => {
    mocks.enabled.value = false;
    await expect(verifiedEmail()).resolves.toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
