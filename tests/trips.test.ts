// ============================================================================
// Database tests for the Match / Discover / chat flow (schema section 8):
// mutual interest -> group chat -> final plan -> publish -> join / leave.
// Runs the real supabase/schema.sql in an in-memory Postgres (PGlite).
// ============================================================================
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const U = {
  ana: "00000000-0000-4000-8000-00000000000a",
  ben: "00000000-0000-4000-8000-00000000000b",
  cy: "00000000-0000-4000-8000-00000000000c",
  dee: "00000000-0000-4000-8000-00000000000d",
  eli: "00000000-0000-4000-8000-00000000000e",
};
type Who = keyof typeof U;
let db: PGlite;
const plan: Partial<Record<Who, string>> = {};

async function as<T = Record<string, unknown>>(who: Who | "service" | "owner", sql: string, params: unknown[] = []) {
  await db.exec("reset role;");
  if (who === "service") await db.exec("set role service_role;");
  else if (who !== "owner") await db.exec(`select set_config('request.jwt.claim.sub', '${U[who]}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}
const key = (...who: Who[]) => who.map((w) => plan[w]!).sort().join(",");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  await db.exec(readFileSync(path.join(import.meta.dirname, "../supabase/schema.sql"), "utf8").split("-- ==== STORAGE")[0]);
  await db.exec("insert into public.allowed_domains values ('usc.edu')");
  for (const w of Object.keys(U) as Who[]) {
    await db.exec(`insert into auth.users values ('${U[w]}', '${w}@usc.edu')`);
    await as(w, `insert into public.profiles (id, display_name, msba_year, travel_experience, pace, schedule, completed) values ($1, $2, '1st', 'some', 'balanced', 'flexible', true)`, [U[w], w]);
    const r = await as<{ id: string }>(w, `insert into public.travel_plans (user_id, timing_mode, break_id, date_mode, trip_length_min, trip_length_max, destinations, destination_flex, budget_min, budget_max)
      values ($1, 'break', 'thanksgiving', 'anytime', 2, 4, '[]', 'open', 100, 900) returning id`, [U[w]]);
    plan[w] = r[0].id;
  }
}, 60_000);

describe("mutual interest opens a group chat", () => {
  let trip = "";
  it("one tap is not enough; both taps are", async () => {
    expect((await as("ana", "select * from public.express_interest($1)", [key("ana", "ben")]))[0]).toEqual({ mutual: false, interested: 1, needed: 2 });
    expect(await as("ben", "select * from public.interest_counts($1)", [[key("ana", "ben")]])).toEqual([{ plan_key: key("ana", "ben"), interested: 1, mine: false }]);
    expect((await as("ben", "select * from public.express_interest($1)", [key("ana", "ben")]))[0].mutual).toBe(true);
  });

  it("you can't tap interest for a trip you're not in, or a malformed one", async () => {
    await expect(as("cy", "select * from public.express_interest($1)", [key("ana", "ben")])).rejects.toThrow(/NOT_MEMBER/);
    await expect(as("ana", "select * from public.express_interest($1)", ["not-a-key"])).rejects.toThrow(/BAD_INPUT/);
  });

  it("only the server can open the chat, and only after everyone is interested", async () => {
    await expect(as("ana", "select * from public.start_trip($1, $2, 'long', '[]', '{}')", [U.ana, key("ana", "ben")])).rejects.toThrow(/permission denied/);
    await expect(as("service", "select * from public.start_trip($1, $2, 'long', '[]', '{}')", [U.ana, key("ana", "cy")])).rejects.toThrow(/not everyone is interested/);
    const r = await as<{ proposal_id: string; created: boolean }>("service", "select * from public.start_trip($1, $2, 'long', '[]', '{\"summary\":\"suggested\"}')", [U.ana, key("ana", "ben")]);
    expect(r[0].created).toBe(true);
    trip = r[0].proposal_id;
    expect(await as("ana", "select * from public.proposal_approvals")).toHaveLength(0); // the suggestion isn't accepted by anyone yet
  });

  it("members chat; others can't read or post; nobody can post as someone else", async () => {
    await as("ana", "insert into public.trip_messages (proposal_id, user_id, body) values ($1, $2, 'Move to Fri-Sun?')", [trip, U.ana]);
    expect(await as("ben", "select body from public.trip_messages")).toEqual([{ body: "Move to Fri-Sun?" }]);
    expect(await as("cy", "select body from public.trip_messages")).toHaveLength(0);
    await expect(as("cy", "insert into public.trip_messages (proposal_id, user_id, body) values ($1, $2, 'hi')", [trip, U.cy])).rejects.toThrow(/row-level security/);
    await expect(as("ben", "insert into public.trip_messages (proposal_id, user_id, body) values ($1, $2, 'fake')", [trip, U.ana])).rejects.toThrow(/row-level security/);
  });

  it("contacts stay hidden until the trip is confirmed", async () => {
    expect(await as("ana", "select * from public.trip_contacts($1)", [trip])).toHaveLength(0);
  });

  it("final plan: submitter accepts, then the other accepts -> confirmed and published with spots", async () => {
    const merged = JSON.stringify({ summary: "final", meta: { final: true, wantMore: true, extraSpots: 2, joinDeadline: "2099-11-23T08:00:00Z" } });
    const v = await as<{ submit_final_plan: number }>("service", "select public.submit_final_plan($1, $2, 1, '[]', $3::jsonb, 'see chat')", [U.ana, trip, merged]);
    expect(v[0].submit_final_plan).toBe(2);
    expect((await as<{ s: string }>("ben", "select public.accept_proposal($1, 2) as s", [trip]))[0].s).toBe("confirmed");
    const row = (await as<{ published: boolean; capacity: number }>("ana", "select published, capacity from public.proposals where id = $1", [trip]))[0];
    expect(row).toEqual({ published: true, capacity: 4 });
    const contacts = await as<{ email: string }>("ben", "select email from public.trip_contacts($1) order by email", [trip]);
    expect(contacts.map((c) => c.email)).toEqual(["ana@usc.edu", "ben@usc.edu"]);
    expect(await as("cy", "select * from public.trip_contacts($1)", [trip])).toHaveLength(0);
  });

  it("Discover shows the trip to others without names", async () => {
    const open = await as<{ id: string; size: number; capacity: number; is_member: boolean; members: unknown[] }>("cy", "select id, size, capacity, is_member, members from public.open_trips");
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ id: trip, size: 2, capacity: 4, is_member: false });
    expect(JSON.stringify(open[0].members)).not.toMatch(/ana|ben/);
  });

  it("join is instant up to the cap; Strict size preferences are respected", async () => {
    expect((await as<{ join_trip: number }>("cy", "select public.join_trip($1)", [trip]))[0].join_trip).toBe(3);
    // Dee only wants pairs, strictly: joining would make 4.
    await as("owner", "update public.profiles set group_pref_long = '2', group_strict_long = true where id = $1", [U.dee]);
    await expect(as("dee", "select public.join_trip($1)", [trip])).rejects.toThrow(/GROUP_SIZE_STRICT/);
    // Flexible is fine.
    await as("owner", "update public.profiles set group_strict_long = false where id = $1", [U.dee]);
    expect((await as<{ join_trip: number }>("dee", "select public.join_trip($1)", [trip]))[0].join_trip).toBe(4);
    await expect(as("eli", "select public.join_trip($1)", [trip])).rejects.toThrow(/FULL/);
  });

  it("the original pair sees the group grew; 'stay' acknowledges the new size", async () => {
    const before = await as<{ ack_size: number }>("ana", "select ack_size from public.proposal_members where proposal_id = $1 and user_id = $2", [trip, U.ana]);
    expect(before[0].ack_size).toBe(2);
    await as("ana", "select public.ack_group_size($1)", [trip]);
    const after = await as<{ ack_size: number }>("ana", "select ack_size from public.proposal_members where proposal_id = $1 and user_id = $2", [trip, U.ana]);
    expect(after[0].ack_size).toBe(4);
  });

  it("leaving frees the spot, and someone else can take it", async () => {
    expect((await as<{ s: string }>("cy", "select public.leave_trip($1) as s", [trip]))[0].s).toBe("confirmed");
    expect((await as<{ join_trip: number }>("eli", "select public.join_trip($1)", [trip]))[0].join_trip).toBe(4);
    expect(await as("cy", "select * from public.trip_messages")).toHaveLength(0); // no longer a member
  });
});

describe("other paths", () => {
  it("a pending match where someone leaves ends as 'match failed' and isn't suggested again", async () => {
    await as("cy", "select * from public.express_interest($1)", [key("cy", "dee")]);
    await as("dee", "select * from public.express_interest($1)", [key("cy", "dee")]);
    const t = (await as<{ proposal_id: string }>("service", "select * from public.start_trip($1, $2, 'long', '[]', '{}')", [U.cy, key("cy", "dee")]))[0].proposal_id;
    expect((await as<{ s: string }>("dee", "select public.leave_trip($1) as s", [t]))[0].s).toBe("declined");
    expect(await as("dee", "select target_key from public.match_passes")).toEqual([{ target_key: key("cy", "dee") }]);
  });

  it("'I'm going no matter what' publishes a solo trip straight to Discover", async () => {
    const id = (await as<{ host_trip: string }>("service", "select public.host_trip($1, $2, 'weekend', '[]', '{\"summary\":\"Malibu\"}', 3, null)", [U.ben, plan.ben]))[0].host_trip;
    const open = await as<{ id: string; size: number; capacity: number }>("cy", "select id, size, capacity from public.open_trips where id = $1", [id]);
    expect(open[0]).toMatchObject({ size: 1, capacity: 3 });
    await expect(as("service", "select public.host_trip($1, $2, 'weekend', '[]', '{}', 3, null)", [U.ana, plan.ben])).rejects.toThrow(/NOT_MEMBER/);
  });

  it("closed sign-ups and ended plans are respected", async () => {
    const id = (await as<{ host_trip: string }>("service", "select public.host_trip($1, $2, 'long', '[]', '{}', 4, '2000-01-01')", [U.cy, plan.cy]))[0].host_trip;
    await expect(as("eli", "select public.join_trip($1)", [id])).rejects.toThrow(/sign-ups closed/);
    await as("dee", "update public.travel_plans set status = 'ended' where id = $1", [plan.dee]);
    expect(await as("ana", "select id from public.plan_cards where id = $1", [plan.dee])).toHaveLength(0);
    await expect(as("dee", "select * from public.express_interest($1)", [key("ana", "dee")])).rejects.toThrow(/BAD_INPUT/);
  });

  it("contacts table is private to its owner", async () => {
    await as("ana", "insert into public.contacts (user_id, contact) values ($1, 'IG @ana')", [U.ana]);
    expect(await as("ben", "select * from public.contacts")).toHaveLength(0);
    await expect(as("ben", "insert into public.contacts (user_id, contact) values ($1, 'x')", [U.ana])).rejects.toThrow(/row-level security|duplicate/);
  });
});
