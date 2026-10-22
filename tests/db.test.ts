// ============================================================================
// Database tests: run the REAL supabase/schema.sql inside an in-memory Postgres
// (PGlite), then act as different signed-in users to prove the security rules
// and the proposal state machine at the database level — not just in the UI.
//
// We recreate the tiny bits of Supabase the schema depends on: the `auth`
// schema (users table + auth.uid()), and the anon / authenticated /
// service_role roles with Supabase's default grants.
// ============================================================================
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  -- Supabase grants table/function access to these roles by default; RLS is what protects data.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const ids = {
  ana: "00000000-0000-4000-8000-00000000000a",
  ben: "00000000-0000-4000-8000-00000000000b",
  cy: "00000000-0000-4000-8000-00000000000c",
  outsider: "00000000-0000-4000-8000-0000000000ff",
};

let db: PGlite;

// Run SQL as a given user (role authenticated + their id), then switch back.
async function as<T = Record<string, unknown>>(who: keyof typeof ids | "service", sql: string, params: unknown[] = []) {
  await db.exec("reset role;");
  if (who === "service") await db.exec("set role service_role;");
  else await db.exec(`select set_config('request.jwt.claim.sub', '${ids[who]}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}

const planSql = (id: string, notes: string) => `
  insert into public.travel_plans (user_id, timing_mode, break_id, date_mode, trip_length_min, trip_length_max,
    destinations, destination_flex, budget_min, budget_max, vibes, notes)
  values ('${id}', 'break', 'thanksgiving', 'anytime', 2, 4, '{joshua-tree}', 'open_to_nearby', 150, 400, '{outdoors}', '${notes}')`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const schema = readFileSync(path.join(import.meta.dirname, "../supabase/schema.sql"), "utf8").split("-- ==== STORAGE")[0];
  await db.exec(schema);
  // Seed: Ana, Ben, Cy are allowlisted; Outsider has an account but isn't on the list.
  await db.exec(`
    insert into auth.users values ('${ids.ana}', 'ana@usc.edu'), ('${ids.ben}', 'Ben@USC.edu'), ('${ids.cy}', 'cy@usc.edu'), ('${ids.outsider}', 'out@gmail.com');
    insert into public.allowed_emails (email) values ('ana@usc.edu'), ('ben@usc.edu'), ('cy@usc.edu');
  `);
  for (const [who, name] of [["ana", "Ana"], ["ben", "Ben"], ["cy", "Cy"]] as const) {
    await as(who, `insert into public.profiles (id, display_name, msba_year, travel_experience, pace, schedule, completed)
                   values ($1, $2, '1st', 'some', 'balanced', 'flexible', true)`, [ids[who], name]);
    await as(who, planSql(ids[who], `private note of ${name}`));
  }
}, 60_000);

describe("RLS: profiles and plans", () => {
  it("allowlisted users can read classmates' profiles", async () => {
    const rows = await as("ana", "select display_name from public.profiles order by display_name");
    expect(rows.map((r) => r.display_name)).toEqual(["Ana", "Ben", "Cy"]);
  });

  it("a non-allowlisted account sees nothing and can't create a profile", async () => {
    expect(await as("outsider", "select * from public.profiles")).toHaveLength(0);
    expect(await as("outsider", "select * from public.plan_cards")).toHaveLength(0);
    await expect(
      as("outsider", `insert into public.profiles (id, display_name, msba_year, travel_experience, pace, schedule)
                      values ('${ids.outsider}', 'X', '1st', 'some', 'balanced', 'flexible')`),
    ).rejects.toThrow(/row-level security/);
  });

  it("nobody can read the allowlist", async () => {
    await expect(as("ana", "select * from public.allowed_emails")).rejects.toThrow(/permission denied/);
  });

  it("a user cannot edit another user's plan or profile", async () => {
    const updated = await as("ana", `update public.travel_plans set budget_max = 9999 where user_id = '${ids.ben}' returning user_id`);
    expect(updated).toHaveLength(0);
    const prof = await as("ana", `update public.profiles set display_name = 'Hacked' where id = '${ids.ben}' returning id`);
    expect(prof).toHaveLength(0);
    const ben = await as("ben", "select budget_max from public.travel_plans");
    expect(ben[0].budget_max).toBe(400);
  });

  it("a user cannot insert a plan for someone else", async () => {
    await db.exec(`delete from public.travel_plans where user_id = '${ids.cy}'`);
    await expect(as("ana", planSql(ids.cy, "x"))).rejects.toThrow(/row-level security/);
    await as("cy", planSql(ids.cy, "private note of Cy"));
  });

  it("other people's private notes are never readable", async () => {
    const own = await as("ana", "select user_id, notes from public.travel_plans");
    expect(own).toHaveLength(1); // only my own row
    expect(own[0].user_id).toBe(ids.ana);
    await expect(as("ana", "select notes from public.plan_cards")).rejects.toThrow(/notes/);
    const cards = await as("ana", "select user_id from public.plan_cards");
    expect(cards).toHaveLength(3);
  });

  it("enforces one plan per user and validates input in the database", async () => {
    await expect(as("ana", planSql(ids.ana, "dup"))).rejects.toThrow(/duplicate key/);
    await expect(as("ana", "update public.travel_plans set budget_min = 500, budget_max = 100")).rejects.toThrow(/check constraint/);
    await expect(as("ana", "update public.travel_plans set vibes = '{partying}'")).rejects.toThrow(/check constraint/);
  });
});

describe("proposals", () => {
  const merged = JSON.stringify({ summary: "test" });
  let pid = "";

  it("regular users cannot call create_proposal directly (server only)", async () => {
    await expect(
      as("ana", "select * from public.create_proposal($1, $2, '[]'::jsonb, $3::jsonb)", [ids.ana, [ids.ana, ids.ben], merged]),
    ).rejects.toThrow(/permission denied/);
  });

  it("creates v1 with the creator's approval; a double-click returns the same proposal", async () => {
    const first = await as<{ proposal_id: string; created: boolean }>("service", "select * from public.create_proposal($1, $2, '[]'::jsonb, $3::jsonb)", [ids.ana, [ids.ben, ids.ana], merged]);
    const again = await as<{ proposal_id: string; created: boolean }>("service", "select * from public.create_proposal($1, $2, '[]'::jsonb, $3::jsonb)", [ids.ana, [ids.ana, ids.ben], merged]);
    expect(first[0].created).toBe(true);
    expect(again[0]).toEqual({ proposal_id: first[0].proposal_id, created: false });
    pid = first[0].proposal_id;
    const approvals = await as("ana", "select user_id, version from public.proposal_approvals");
    expect(approvals).toEqual([{ user_id: ids.ana, version: 1 }]);
  });

  it("B sees it as pending; a non-member (Cy) can't see it", async () => {
    expect((await as("ben", "select status from public.proposals"))[0].status).toBe("pending");
    expect(await as("cy", "select * from public.proposals")).toHaveLength(0);
    expect(await as("cy", "select * from public.proposal_versions")).toHaveLength(0);
  });

  it("users cannot write approvals directly, for themselves or anyone else", async () => {
    await expect(as("ben", `insert into public.proposal_approvals values ('${pid}', 1, '${ids.ben}')`)).rejects.toThrow(/row-level security|permission denied/);
    await expect(as("ben", `insert into public.proposal_approvals values ('${pid}', 1, '${ids.ana}')`)).rejects.toThrow(/row-level security|permission denied/);
    await expect(as("ben", `update public.proposals set status = 'confirmed' where id = '${pid}' returning id`)).resolves.toHaveLength(0);
  });

  it("a non-member cannot accept", async () => {
    await expect(as("cy", "select public.accept_proposal($1, 1)", [pid])).rejects.toThrow(/NOT_MEMBER/);
  });

  it("counter makes v2; old approvals no longer count; stale accepts are rejected", async () => {
    const v = await as<{ counter_proposal: number }>("service", "select public.counter_proposal($1, $2, 1, '[]'::jsonb, $3::jsonb, 'shorter?')", [ids.ben, pid, merged]);
    expect(v[0].counter_proposal).toBe(2);
    // A second counter based on the old version is stale.
    await expect(as("service", "select public.counter_proposal($1, $2, 1, '[]'::jsonb, $3::jsonb, '')", [ids.ana, pid, merged])).rejects.toThrow(/STALE_VERSION/);
    // Ben accepting the old v1 is stale.
    await expect(as("ben", "select public.accept_proposal($1, 1)", [pid])).rejects.toThrow(/STALE_VERSION/);
    // Ana's v1 approval does not carry over: one approval on v2 is still pending.
    expect((await as("ben", "select public.accept_proposal($1, 2) as s", [pid]))[0].s).toBe("pending");
    expect(await as("ana", "select * from public.confirmed_itineraries")).toHaveLength(0);
  });

  it("confirms only when everyone accepts the same version; both can view it", async () => {
    expect((await as("ana", "select public.accept_proposal($1, 2) as s", [pid]))[0].s).toBe("confirmed");
    expect((await as("ana", "select public.accept_proposal($1, 2) as s", [pid]))[0].s).toBe("confirmed"); // repeat click is harmless
    expect(await as("ana", "select version from public.confirmed_itineraries")).toEqual([{ version: 2 }]);
    expect(await as("ben", "select version from public.confirmed_itineraries")).toEqual([{ version: 2 }]);
    expect(await as("cy", "select * from public.confirmed_itineraries")).toHaveLength(0);
  });

  it("decline ends a proposal for everyone; then a new one can be opened", async () => {
    const r = await as<{ proposal_id: string }>("service", "select * from public.create_proposal($1, $2, '[]'::jsonb, $3::jsonb)", [ids.cy, [ids.cy, ids.ana], merged]);
    const p2 = r[0].proposal_id;
    expect((await as("ana", "select public.decline_proposal($1, 1) as s", [p2]))[0].s).toBe("declined");
    expect((await as("cy", "select status, declined_by from public.proposals where id = $1", [p2]))[0]).toEqual({ status: "declined", declined_by: ids.ana });
    await expect(as("cy", "select public.accept_proposal($1, 1)", [p2])).rejects.toThrow(/NOT_PENDING/);
    const r2 = await as<{ created: boolean }>("service", "select * from public.create_proposal($1, $2, '[]'::jsonb, $3::jsonb)", [ids.cy, [ids.cy, ids.ana], merged]);
    expect(r2[0].created).toBe(true);
  });

  it("groups of three need all three approvals", async () => {
    const r = await as<{ proposal_id: string }>("service", "select * from public.create_proposal($1, $2, '[]'::jsonb, $3::jsonb)", [ids.ana, [ids.ana, ids.ben, ids.cy], merged]);
    const g = r[0].proposal_id;
    expect((await as("ben", "select public.accept_proposal($1, 1) as s", [g]))[0].s).toBe("pending");
    expect((await as("cy", "select public.accept_proposal($1, 1) as s", [g]))[0].s).toBe("confirmed");
  });

  it("rejects proposals that include non-allowlisted people", async () => {
    await expect(as("service", "select * from public.create_proposal($1, $2, '[]'::jsonb, $3::jsonb)", [ids.ana, [ids.ana, ids.outsider], merged])).rejects.toThrow(/NOT_ALLOWED/);
  });

  it("pilot_stats counts joined students without exposing emails", async () => {
    expect(await as("ana", "select * from public.pilot_stats()")).toEqual([{ total: 3, joined: 3 }]);
    expect(await as("outsider", "select * from public.pilot_stats()")).toHaveLength(0);
  });

  it("the signed-out role gets nothing", async () => {
    await db.exec("set role anon;");
    await expect(db.query("select * from public.profiles")).rejects.toThrow(/permission denied/);
    await db.exec("reset role;");
  });
});
