import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
const COOKIE = "tm_device_profile";
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function decode(text: string) { return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0)); }
async function key() {
  const secret = process.env['SESSION_SECRET'] ?? process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!secret || secret.length < 32) throw new Error("The team needs to connect secure profile storage.");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function issueDeviceProfile(profileId: string) {
  const payload = encode(new TextEncoder().encode(JSON.stringify({ id: profileId, expires: Date.now() + 7 * 86400000 })));
  const signature = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(payload));
  setCookie(COOKIE, `${payload}.${encode(new Uint8Array(signature))}`, { httpOnly: true, secure: getRequest().url.startsWith("https:"), sameSite: "lax", path: "/", maxAge: 7 * 86400 });
}
export async function deviceProfile(): Promise<string | null> {
  const value = getCookie(COOKIE);
  if (!value) return null;
  try {
    const [payload, signature] = value.split(".");
    if (!payload || !signature || !await crypto.subtle.verify("HMAC", await key(), decode(signature), new TextEncoder().encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    return typeof data.id === "string" && data.expires > Date.now() ? data.id : null;
  } catch { return null; }
}
export function clearDeviceProfile() { setCookie(COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 }); }
