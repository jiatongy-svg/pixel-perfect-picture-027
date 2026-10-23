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

it("003_places_and_mbti converts saved quick-pick ids into places, in order", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  await db.exec(read("fixtures/schema-v1.sql"));
  await db.exec(read("../supabase/migrations/002_open_to_usc.sql"));
  const id = "00000000-0000-4000-8000-000000000001";
  await db.exec(`insert into auth.users values ('${id}','me@usc.edu');
    insert into public.profiles (id, display_name, msba_year, travel_experience, pace, schedule, completed) values ('${id}','Me','1st','some','balanced','flexible',true);
    insert into public.travel_plans (user_id, timing_mode, break_id, date_mode, trip_length_min, trip_length_max, destinations, destination_flex, budget_min, budget_max)
      values ('${id}','break','winter','anytime',2,4,'{tokyo,san-diego}','fixed',100,900);`);
  await db.exec(read("../supabase/migrations/003_places_and_mbti.sql"));
  const row = (await db.query<{ destinations: { key: string; name: string; lat: number }[] }>("select destinations from public.travel_plans")).rows[0];
  expect(row.destinations.map((d) => d.key)).toEqual(["tokyo", "san-diego"]);
  expect(row.destinations[0].name).toBe("Tokyo");
  expect(typeof row.destinations[0].lat).toBe("number");
  // The view is back, and running the upgrade again is harmless.
  expect((await db.query("select destinations from public.plan_cards")).rows).toHaveLength(0); // superuser isn't allowlisted
  await expect(db.exec(read("../supabase/migrations/003_places_and_mbti.sql"))).resolves.toBeDefined();
  await db.exec(`update public.profiles set mbti = 'ENFP'`);
  await expect(db.exec(`update public.travel_plans set destinations = '[]', destination_flex = 'fixed'`)).rejects.toThrow(/check constraint/);
});

it("004_multiple_plans keeps plans and open proposals, then allows more plans", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  await db.exec(read("fixtures/schema-v1.sql"));
  await db.exec(read("../supabase/migrations/002_open_to_usc.sql"));
  await db.exec(read("../supabase/migrations/003_places_and_mbti.sql"));
  const a = "00000000-0000-4000-8000-00000000000a", b = "00000000-0000-4000-8000-00000000000b";
  const plan = (u: string) => `insert into public.travel_plans (user_id, timing_mode, break_id, date_mode, trip_length_min, trip_length_max, destinations, destination_flex, budget_min, budget_max)
    values ('${u}','break','winter','anytime',2,4,'[]','open',100,900)`;
  await db.exec(`insert into auth.users values ('${a}','a@usc.edu'), ('${b}','b@usc.edu');
    insert into public.profiles (id, display_name, msba_year, travel_experience, pace, schedule, completed) values ('${a}','A','1st','some','balanced','flexible',true), ('${b}','B','1st','some','balanced','flexible',true);
    ${plan(a)}; ${plan(b)};
    insert into public.proposals (id, member_key, size, created_by) values ('00000000-0000-4000-8000-0000000000aa', '${a},${b}', 2, '${a}');
    insert into public.proposal_members values ('00000000-0000-4000-8000-0000000000aa','${a}'), ('00000000-0000-4000-8000-0000000000aa','${b}');`);
  await expect(db.exec(plan(a))).rejects.toThrow(/duplicate key/); // before: one plan each

  await db.exec(read("../supabase/migrations/004_multiple_plans.sql"));
  await db.exec(read("../supabase/migrations/004_multiple_plans.sql")); // safe twice

  const ids = (await db.query<{ id: string }>("select id from public.travel_plans order by id")).rows.map((r) => r.id);
  expect((await db.query<{ plan_key: string }>("select plan_key from public.proposals")).rows[0].plan_key).toBe(ids.join(","));
  await db.exec(plan(a)); // now a second plan is fine
  const both = (await db.query<{ id: string; user_id: string }>("select id, user_id from public.travel_plans")).rows;
  const aPlans = both.filter((r) => r.user_id === a).map((r) => r.id);
  const bPlan = both.find((r) => r.user_id === b)!.id;
  // A new proposal on A's second plan + B's plan is allowed alongside the old one.
  const r = await db.query<{ created: boolean }>("select * from public.create_proposal($1, $2, '[]'::jsonb, '{}'::jsonb)", [a, [aPlans.find((x) => !ids.includes(x)), bPlan]]);
  expect(r.rows[0].created).toBe(true);
});

it("005_trips_chat_groups applies on top of 002–004 (twice) and keeps data", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  await db.exec(read("fixtures/schema-v1.sql"));
  for (const m of ["002_open_to_usc", "003_places_and_mbti", "004_multiple_plans"]) await db.exec(read(`../supabase/migrations/${m}.sql`));
  const a = "00000000-0000-4000-8000-00000000000a";
  await db.exec(`insert into auth.users values ('${a}','a@usc.edu');
    insert into public.profiles (id, display_name, msba_year, travel_experience, pace, schedule, completed) values ('${a}','A','1st','some','balanced','flexible',true);
    insert into public.travel_plans (user_id, timing_mode, break_id, date_mode, trip_length_min, trip_length_max, destinations, destination_flex, budget_min, budget_max)
      values ('${a}','break','winter','anytime',2,4,'[]','open',100,900);`);
  await db.exec(read("../supabase/migrations/005_trips_chat_groups.sql"));
  await db.exec(read("../supabase/migrations/005_trips_chat_groups.sql")); // safe twice
  const plan = (await db.query<{ status: string; group_pref: string | null }>("select status, group_pref from public.travel_plans")).rows[0];
  expect(plan).toEqual({ status: "active", group_pref: null });
  const prof = (await db.query<{ group_pref_long: string; has_license: boolean }>("select group_pref_long, has_license from public.profiles")).rows[0];
  expect(prof).toEqual({ group_pref_long: "any", has_license: false });
});
