// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222", outsider = "33333333-3333-4333-8333-333333333333", thread = "44444444-4444-4444-8444-444444444444";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid, email text, email_confirmed_at timestamptz); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.uid', true)::uuid $$;`);
  for (const file of ["0000_tripmatch_init.sql", "0001_chat_mbti.sql", "0002_profiles_and_mutual_match.sql"]) await db.exec(readFileSync(new URL(`../../drizzle/migrations/${file}`, import.meta.url), "utf8"));
  await db.query(`INSERT INTO trip_profiles(id,email,first_name,break_id,start_date,end_date,budget) VALUES ($1,'a@usc.edu','A','winter','2026-12-26','2027-01-02','700plus'),($2,'b@usc.edu','B','winter','2026-12-26','2027-01-02','700plus')`, [a,b]);
  await db.query(`INSERT INTO auth.users VALUES ($1,'a@usc.edu',now()),($2,'b@usc.edu',now()),($3,'outsider@usc.edu',now())`,[a,b,outsider]);
  await db.query(`INSERT INTO proposals(id,user_profile_id,match_profile_id,merged) VALUES ($1,$2,$3,'{}')`,[thread,a,b]);
},30000);
afterAll(async () => { await db.close(); });
async function canRead(id: string) { await db.query("SELECT set_config('test.uid',$1,false)",[id]); return (await db.query<{allowed:boolean}>("SELECT can_read_trip_chat($1) AS allowed",[thread])).rows[0]!.allowed; }
describe("real database mutual match gate", () => {
  it("requires both approvals, is idempotent, and excludes outsiders and unverified users",async () => {
    expect(await canRead(a)).toBe(false);
    await expect(db.query("SELECT decide_trip_plan($1,$2,'accepted')",[thread,outsider])).rejects.toThrow("Not a plan member");
    await expect(db.query("SELECT decide_trip_plan($1,NULL,'accepted')",[thread])).rejects.toThrow("Not a plan member");
    await db.query("SELECT decide_trip_plan($1,$2,'accepted')",[thread,a]);
    await db.query("SELECT decide_trip_plan($1,$2,'accepted')",[thread,a]);
    expect(await canRead(a)).toBe(false);
    await db.query("SELECT decide_trip_plan($1,$2,'accepted')",[thread,b]);
    expect(await canRead(a)).toBe(true); expect(await canRead(b)).toBe(true); expect(await canRead(outsider)).toBe(false);
    await db.query("UPDATE auth.users SET email_confirmed_at = NULL WHERE id=$1",[a]); expect(await canRead(a)).toBe(false);
    await db.query("SELECT decide_trip_plan($1,$2,'passed')",[thread,b]); expect(await canRead(b)).toBe(false);
    await expect(db.query("SELECT decide_trip_plan($1,$2,'accepted')",[thread,a])).rejects.toThrow("closed");
  });
});
