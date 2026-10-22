// The upgrade file must apply cleanly on a database built from the ORIGINAL
// schema (the one already running in Supabase), keep existing data, and open
// sign-in to @usc.edu.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const read = (f: string) => readFileSync(path.join(import.meta.dirname, f), "utf8").split("-- ==== STORAGE")[0];

it("002_open_to_usc upgrades the v1 schema without touching data", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  await db.exec(read("fixtures/schema-v1.sql"));
  await db.exec(`insert into auth.users values ('00000000-0000-4000-8000-000000000001','me@usc.edu'), ('00000000-0000-4000-8000-000000000002','new@usc.edu');
                 insert into public.allowed_emails values ('me@usc.edu');`);
  await db.exec(read("../supabase/migrations/002_open_to_usc.sql"));

  expect((await db.query("select email from public.allowed_emails")).rows).toEqual([{ email: "me@usc.edu" }]);
  await db.exec(`select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false); set role authenticated;`);
  expect((await db.query<{ ok: boolean }>("select public.is_allowlisted() as ok")).rows[0].ok).toBe(true);
  expect((await db.query("select * from public.pilot_stats()")).rows).toEqual([{ total: 1, joined: 0, open: true }]);
  await db.exec("reset role");
  // Running it a second time is harmless (Navya might click Run twice).
  await expect(db.exec(read("../supabase/migrations/002_open_to_usc.sql"))).resolves.toBeDefined();
});
