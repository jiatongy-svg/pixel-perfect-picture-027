-- ============================================================================
-- Upgrade 004: several plans per student; proposals tied to specific plans.
--
-- HOW TO USE: Supabase -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run on the existing database, and safe to run twice. Existing plans
-- and proposals are kept: every current plan simply gets its own id.
-- ============================================================================

-- 1. Plans get their own id and an optional private title; up to 5 per student.
drop view if exists public.plan_cards;

alter table public.travel_plans add column if not exists id uuid not null default gen_random_uuid();
alter table public.travel_plans add column if not exists title text not null default '' check (char_length(title) <= 60);

do $$
begin
  -- Move the primary key from user_id (one plan each) to id (many plans each).
  if exists (select 1 from information_schema.key_column_usage
             where table_schema = 'public' and table_name = 'travel_plans'
               and constraint_name = 'travel_plans_pkey' and column_name = 'user_id') then
    alter table public.travel_plans drop constraint travel_plans_pkey;
    alter table public.travel_plans add primary key (id);
  end if;
end $$;
create index if not exists travel_plans_user on public.travel_plans (user_id);

create or replace function public.limit_plans_per_user()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.travel_plans where user_id = new.user_id) >= 5 then
    raise exception 'TOO_MANY_PLANS: you can save up to 5 plans';
  end if;
  return new;
end;
$$;
drop trigger if exists plans_limit on public.travel_plans;
create trigger plans_limit before insert on public.travel_plans for each row execute function public.limit_plans_per_user();

-- Classmates' view now includes the plan id (still no notes or title).
create view public.plan_cards
with (security_invoker = false) as
  select id, user_id, timing_mode, break_id, date_mode, preferred_start, preferred_end, flex_days,
         weekends, trip_length_min, trip_length_max, destinations, destination_flex,
         budget_min, budget_max, vibes, bringing_car, seats_offered, bringing_gear, updated_at
  from public.travel_plans
  where public.is_allowlisted();
revoke all on public.plan_cards from anon, authenticated;
grant select on public.plan_cards to authenticated;

-- 2. Proposals remember which plans they are about.
alter table public.proposals add column if not exists plan_key text;
-- Existing proposals: everyone had exactly one plan, so use those.
update public.proposals p set plan_key = coalesce((
  select string_agg(t.id::text, ',' order by t.id)
  from public.proposal_members m join public.travel_plans t on t.user_id = m.user_id
  where m.proposal_id = p.id
), 'legacy:' || p.member_key)
where p.plan_key is null;
alter table public.proposals alter column plan_key set not null;
drop index if exists public.proposals_one_open_per_group;
create unique index if not exists proposals_one_open_per_plans on public.proposals (plan_key) where status = 'pending';

-- 3. create_proposal now takes plan ids (same argument types, new meaning).
drop function if exists public.create_proposal(uuid, uuid[], jsonb, jsonb);
-- Create a proposal (version 1) between specific PLANS (one plan per person,
-- 2–4 people). The creator's acceptance of v1 is recorded, and the app says so
-- clearly on the button. Only the server (service role) may call this, because
-- the server computes the merged itinerary; it passes the verified user as p_actor.
-- If an open proposal for the same plans already exists, its id is returned
-- instead of creating a duplicate (so double-clicks are harmless).
create function public.create_proposal(p_actor uuid, p_plans uuid[], p_snapshots jsonb, p_merged jsonb)
returns table (proposal_id uuid, created boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_plans uuid[];
  v_members uuid[];
  v_plan_key text;
  v_id uuid;
  v_ok int;
begin
  select array_agg(distinct x order by x) into v_plans from unnest(p_plans) as x;
  if v_plans is null or cardinality(v_plans) not between 2 and 4 or cardinality(v_plans) <> cardinality(p_plans) then
    raise exception 'BAD_INPUT: a proposal needs 2 to 4 different plans';
  end if;
  -- The people behind those plans: one plan per person.
  select array_agg(distinct t.user_id order by t.user_id) into v_members
  from public.travel_plans t where t.id = any (v_plans);
  if v_members is null or cardinality(v_members) <> cardinality(v_plans) then
    raise exception 'BAD_INPUT: each person can bring only one of their plans';
  end if;
  if not (p_actor = any (v_members)) then
    raise exception 'NOT_MEMBER';
  end if;
  -- Every member must be allowed in and have a completed profile.
  select count(*) into v_ok
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = any (v_members) and p.completed and public.email_allowed(u.email);
  if v_ok <> cardinality(v_members) then
    raise exception 'NOT_ALLOWED: every member needs a completed profile';
  end if;

  v_plan_key := array_to_string(v_plans, ',');

  insert into public.proposals (member_key, plan_key, size, created_by)
  values (array_to_string(v_members, ','), v_plan_key, cardinality(v_members), p_actor)
  on conflict (plan_key) where status = 'pending' do nothing
  returning id into v_id;

  if v_id is null then
    -- Someone (maybe this same double-click) already opened one for these plans.
    select p.id into v_id from public.proposals p where p.plan_key = v_plan_key and p.status = 'pending';
    return query select v_id, false;
    return;
  end if;

  insert into public.proposal_members (proposal_id, user_id) select v_id, m from unnest(v_members) as m;
  insert into public.proposal_versions (proposal_id, version, snapshots, merged, created_by)
  values (v_id, 1, p_snapshots, p_merged, p_actor);
  insert into public.proposal_approvals (proposal_id, version, user_id) values (v_id, 1, p_actor);
  return query select v_id, true;
end;
$$;
revoke execute on function public.create_proposal(uuid, uuid[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_proposal(uuid, uuid[], jsonb, jsonb) to service_role;
