-- ============================================================================
-- TripMatch database schema
--
-- HOW TO USE: open your Supabase project -> SQL Editor -> New query, paste this
-- whole file, click "Run". It is safe to run on a fresh project. (Running it a
-- second time on a project that already has the tables will stop with an
-- "already exists" error — that's expected and changes nothing.)
--
-- Big ideas, in plain English:
--   * Every table has Row Level Security (RLS) turned on. With RLS on, the
--     database refuses every read/write unless a "policy" below allows it.
--   * Only people whose email is in `allowed_emails`, or whose email domain is
--     in `allowed_domains` (e.g. usc.edu), can see anything.
--   * You can only change YOUR profile and YOUR plan.
--   * Proposals can only be read by their members, and can only be changed
--     through the functions at the bottom (create / counter / accept /
--     decline). Those functions lock the row first, so double-clicks and two
--     people clicking at once can't create duplicates or approve an old version.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Lock down defaults: the anonymous (signed-out) role gets nothing.
-- ----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke execute on functions from public;


-- ----------------------------------------------------------------------------
-- 1. Allowlist — the 6 pilot emails. Filled by scripts/seed-pilot-users.ts.
--    Nobody can read this table from the app (no policies at all).
-- ----------------------------------------------------------------------------
create table public.allowed_emails (
  email text primary key check (email = lower(email) and email like '%@%'),
  created_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;

-- Whole email domains that may sign in, e.g. 'usc.edu' opens the app to every
-- USC address. Empty = only the individual emails in allowed_emails.
create table public.allowed_domains (
  domain text primary key check (domain = lower(domain) and domain not like '%@%'),
  created_at timestamptz not null default now()
);
alter table public.allowed_domains enable row level security;
revoke all on public.allowed_domains from anon, authenticated;

-- Is this email allowed in? (listed individually, or its domain is open)
-- "security definer" = runs with the table owner's rights so it can read the
-- allowlist tables, while callers still can't read them directly.
create function public.email_allowed(p_email text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.allowed_emails where email = lower(p_email))
      or exists (select 1 from public.allowed_domains where domain = lower(split_part(p_email, '@', 2)));
$$;
revoke execute on function public.email_allowed(text) from public, anon, authenticated;
grant execute on function public.email_allowed(text) to service_role;

-- Is the signed-in user allowed? We look up their email from the auth
-- system by user id (not from anything the browser sends).
create function public.is_allowlisted()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.email_allowed(u.email) from auth.users u where u.id = auth.uid()), false);
$$;
grant execute on function public.is_allowlisted() to authenticated;


-- ----------------------------------------------------------------------------
-- 2. Profiles — the travel profile (separate from any specific trip).
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  msba_year text not null check (msba_year in ('1st', '2nd')),
  photo_path text check (photo_path is null or (photo_path like id::text || '/%' and char_length(photo_path) <= 200)),
  bio text not null default '' check (char_length(bio) <= 280),
  travel_experience text not null check (travel_experience in ('new', 'some', 'seasoned')),
  pace text not null check (pace in ('chill', 'balanced', 'packed')),
  schedule text not null check (schedule in ('early', 'flexible', 'night')),
  lodging_prefs text[] not null default '{}' check (lodging_prefs <@ array['camping', 'budget', 'airbnb', 'hotel']),
  has_car boolean not null default false,
  car_seats int not null default 0 check (car_seats between 0 and 7),
  equipment text[] not null default '{}'
    check (equipment <@ array['tent', 'sleeping_bag', 'camp_stove', 'cooler', 'hiking_gear', 'ski_gear', 'beach_gear']),
  mbti text check (mbti is null or mbti in ('ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ')),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (has_car or car_seats = 0)
);
alter table public.profiles enable row level security;

-- Any allowlisted classmate can read profiles (names, year, photo, travel style).
-- Profiles contain no email addresses.
create policy "profiles: allowlisted can read"
  on public.profiles for select to authenticated
  using (public.is_allowlisted());
create policy "profiles: insert own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid() and public.is_allowlisted());
create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_allowlisted())
  with check (id = auth.uid() and public.is_allowlisted());


-- ----------------------------------------------------------------------------
-- 3. Travel plans — each student can save up to 5 plans (e.g. one for
--    Thanksgiving, one for spring break). Each plan is matched on its own.
-- ----------------------------------------------------------------------------
create table public.travel_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 60), -- private, like notes
  timing_mode text not null check (timing_mode in ('break', 'weekends')),
  break_id text check (break_id in ('thanksgiving', 'winter', 'spring')),
  date_mode text check (date_mode in ('anytime', 'fixed', 'flex')),
  preferred_start date,
  preferred_end date,
  flex_days int not null default 0 check (flex_days between 0 and 7),
  weekends date[] not null default '{}' check (cardinality(weekends) <= 8),
  trip_length_min int not null check (trip_length_min between 1 and 14),
  trip_length_max int not null check (trip_length_max between 1 and 14),
  -- Ranked places: [{ "key": "joshua-tree" | "geo:123", "name", "country", "lat", "lon" }, ...]
  destinations jsonb not null default '[]'::jsonb
    constraint travel_plans_destinations_shape check (case when jsonb_typeof(destinations) = 'array' then jsonb_array_length(destinations) <= 5 else false end),
  destination_flex text not null check (destination_flex in ('fixed', 'open_to_nearby', 'open')),
  budget_min int not null check (budget_min >= 0),
  budget_max int not null check (budget_max <= 10000),
  vibes text[] not null default '{}'
    check (vibes <@ array['outdoors', 'food', 'nightlife', 'relaxed', 'culture', 'adventure']),
  bringing_car boolean not null default false,
  seats_offered int not null default 0 check (seats_offered between 0 and 7),
  bringing_gear text[] not null default '{}'
    check (bringing_gear <@ array['tent', 'sleeping_bag', 'camp_stove', 'cooler', 'hiking_gear', 'ski_gear', 'beach_gear']),
  notes text not null default '' check (char_length(notes) <= 500),
  updated_at timestamptz not null default now(),
  -- Cross-field rules (the server checks these too, with friendlier messages).
  check (budget_min <= budget_max),
  check (trip_length_min <= trip_length_max),
  check (timing_mode <> 'break' or (break_id is not null and date_mode is not null)),
  check (timing_mode <> 'weekends' or cardinality(weekends) >= 1),
  check (date_mode is null or date_mode = 'anytime'
         or (preferred_start is not null and preferred_end is not null and preferred_start <= preferred_end)),
  constraint travel_plans_destinations_needed check (destination_flex = 'open' or (case when jsonb_typeof(destinations) = 'array' then jsonb_array_length(destinations) >= 1 else false end)),
  check (bringing_car or seats_offered = 0)
);
alter table public.travel_plans enable row level security;
create index travel_plans_user on public.travel_plans (user_id);

-- At most 5 plans per student (keeps matching fast and lists readable).
create function public.limit_plans_per_user()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.travel_plans where user_id = new.user_id) >= 5 then
    raise exception 'TOO_MANY_PLANS: you can save up to 5 plans';
  end if;
  return new;
end;
$$;
create trigger plans_limit before insert on public.travel_plans for each row execute function public.limit_plans_per_user();


-- You can read and write ONLY your own plan row here.
create policy "plans: read own"
  on public.travel_plans for select to authenticated
  using (user_id = auth.uid() and public.is_allowlisted());
create policy "plans: insert own"
  on public.travel_plans for insert to authenticated
  with check (user_id = auth.uid() and public.is_allowlisted());
create policy "plans: update own"
  on public.travel_plans for update to authenticated
  using (user_id = auth.uid() and public.is_allowlisted())
  with check (user_id = auth.uid() and public.is_allowlisted());
create policy "plans: delete own"
  on public.travel_plans for delete to authenticated
  using (user_id = auth.uid() and public.is_allowlisted());

-- Classmates see other plans through this view, which leaves out `notes` and `title`.
-- Exactly these columns are shared for matching:
--   timing (mode, break, date mode, preferred dates, flex, weekends, trip length),
--   destinations + flexibility, budget range, vibes, car/seats, gear they'll bring.
-- The view runs with the owner's rights (that's how it can show other rows),
-- and only returns rows when the caller is allowlisted.
create view public.plan_cards
with (security_invoker = false) as
  select id, user_id, timing_mode, break_id, date_mode, preferred_start, preferred_end, flex_days,
         weekends, trip_length_min, trip_length_max, destinations, destination_flex,
         budget_min, budget_max, vibes, bringing_car, seats_offered, bringing_gear, updated_at
  from public.travel_plans
  where public.is_allowlisted();
revoke all on public.plan_cards from anon, authenticated;
grant select on public.plan_cards to authenticated;


-- ----------------------------------------------------------------------------
-- 4. Passes — "not for me" on a match. Hides it for the passer only.
--    target_key = the other plan's id, or a group's sorted plan ids "a,b,c".
-- ----------------------------------------------------------------------------
create table public.match_passes (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_key text not null check (char_length(target_key) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (user_id, target_key)
);
alter table public.match_passes enable row level security;
create policy "passes: read own" on public.match_passes for select to authenticated
  using (user_id = auth.uid() and public.is_allowlisted());
create policy "passes: insert own" on public.match_passes for insert to authenticated
  with check (user_id = auth.uid() and public.is_allowlisted());
create policy "passes: delete own" on public.match_passes for delete to authenticated
  using (user_id = auth.uid() and public.is_allowlisted());


-- ----------------------------------------------------------------------------
-- 5. Proposals (2–4 people), their versions, approvals, and the final trip.
-- ----------------------------------------------------------------------------
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  -- Members' user ids sorted and joined by commas (who is in it).
  member_key text not null,
  -- The plans the proposal is about, sorted ids joined by commas.
  plan_key text not null,
  size int not null check (size between 2 and 4),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'superseded')),
  current_version int not null default 1 check (current_version >= 1),
  created_by uuid not null references public.profiles(id),
  declined_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Only ONE open (pending) proposal per set of plans at a time. (The same
-- people can have separate proposals for different plans, e.g. winter + spring.)
create unique index proposals_one_open_per_plans on public.proposals (plan_key) where status = 'pending';

create table public.proposal_members (
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (proposal_id, user_id)
);
create index proposal_members_user on public.proposal_members (user_id);

create table public.proposal_versions (
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version int not null check (version >= 1),
  snapshots jsonb not null,  -- every member's plan at the time (no private notes)
  merged jsonb not null,     -- the merged itinerary, including the cost estimate
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (proposal_id, version)
);

create table public.proposal_approvals (
  proposal_id uuid not null,
  version int not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (proposal_id, version, user_id),
  foreign key (proposal_id, version) references public.proposal_versions(proposal_id, version) on delete cascade
);

create table public.confirmed_itineraries (
  proposal_id uuid primary key references public.proposals(id) on delete cascade,
  version int not null,
  merged jsonb not null,
  confirmed_at timestamptz not null default now()
);

alter table public.proposals enable row level security;
alter table public.proposal_members enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.proposal_approvals enable row level security;
alter table public.confirmed_itineraries enable row level security;

-- Is the signed-in user a member of this proposal?
create function public.is_proposal_member(p_proposal uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.proposal_members m where m.proposal_id = p_proposal and m.user_id = auth.uid());
$$;
grant execute on function public.is_proposal_member(uuid) to authenticated;

-- Members can READ. There are deliberately NO insert/update/delete policies:
-- every change goes through the functions in section 6.
create policy "proposals: members read" on public.proposals for select to authenticated
  using (public.is_allowlisted() and public.is_proposal_member(id));
create policy "members: members read" on public.proposal_members for select to authenticated
  using (public.is_allowlisted() and public.is_proposal_member(proposal_id));
create policy "versions: members read" on public.proposal_versions for select to authenticated
  using (public.is_allowlisted() and public.is_proposal_member(proposal_id));
create policy "approvals: members read" on public.proposal_approvals for select to authenticated
  using (public.is_allowlisted() and public.is_proposal_member(proposal_id));
create policy "itineraries: members read" on public.confirmed_itineraries for select to authenticated
  using (public.is_allowlisted() and public.is_proposal_member(proposal_id));


-- ----------------------------------------------------------------------------
-- 6. Proposal actions (atomic). Each one locks the proposal row with
--    "for update", so two clicks at the same moment run one after the other.
--
-- Error messages the app understands:
--   STALE_VERSION  -> "This proposal changed. Refresh to see the latest version."
--   NOT_PENDING    -> the proposal was already confirmed or declined
--   NOT_MEMBER / NOT_ALLOWED / BAD_INPUT
-- ----------------------------------------------------------------------------

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

-- Counter: create version N+1 with new terms. Approvals belong to a version,
-- so all earlier approvals stop counting automatically. The counterer must
-- click Accept on the new version like everyone else.
-- Server-only for the same reason as create_proposal.
create function public.counter_proposal(p_actor uuid, p_proposal uuid, p_expected_version int, p_snapshots jsonb, p_merged jsonb, p_note text)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.proposals;
  v_next int;
begin
  select * into v_row from public.proposals where id = p_proposal for update;
  if not found then raise exception 'NOT_MEMBER'; end if;
  if not exists (select 1 from public.proposal_members where proposal_id = p_proposal and user_id = p_actor) then
    raise exception 'NOT_MEMBER';
  end if;
  if v_row.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  if v_row.current_version <> p_expected_version then raise exception 'STALE_VERSION'; end if;

  v_next := v_row.current_version + 1;
  insert into public.proposal_versions (proposal_id, version, snapshots, merged, note, created_by)
  values (p_proposal, v_next, p_snapshots, p_merged, left(coalesce(p_note, ''), 300), p_actor);
  update public.proposals set current_version = v_next, updated_at = now() where id = p_proposal;
  return v_next;
end;
$$;
revoke execute on function public.counter_proposal(uuid, uuid, int, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.counter_proposal(uuid, uuid, int, jsonb, jsonb, text) to service_role;

-- Accept a specific version AS YOURSELF (uses auth.uid(); there is no way to
-- pass someone else's id). When every member has accepted the current
-- version, the proposal becomes confirmed and the itinerary is saved.
create function public.accept_proposal(p_proposal uuid, p_version int)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.proposals;
  v_count int;
begin
  if v_me is null or not public.is_allowlisted() then raise exception 'NOT_ALLOWED'; end if;
  select * into v_row from public.proposals where id = p_proposal for update;
  if not found or not exists (select 1 from public.proposal_members where proposal_id = p_proposal and user_id = v_me) then
    raise exception 'NOT_MEMBER';
  end if;
  if v_row.current_version <> p_version then raise exception 'STALE_VERSION'; end if;
  if v_row.status = 'confirmed' then return 'confirmed'; end if; -- harmless repeat click
  if v_row.status <> 'pending' then raise exception 'NOT_PENDING'; end if;

  insert into public.proposal_approvals (proposal_id, version, user_id)
  values (p_proposal, p_version, v_me)
  on conflict do nothing;

  select count(*) into v_count from public.proposal_approvals where proposal_id = p_proposal and version = p_version;
  if v_count = v_row.size then
    update public.proposals set status = 'confirmed', updated_at = now() where id = p_proposal;
    insert into public.confirmed_itineraries (proposal_id, version, merged)
    select proposal_id, version, merged from public.proposal_versions where proposal_id = p_proposal and version = p_version
    on conflict do nothing;
    return 'confirmed';
  end if;
  return 'pending';
end;
$$;
grant execute on function public.accept_proposal(uuid, int) to authenticated;

-- Decline: ends the proposal for every member.
create function public.decline_proposal(p_proposal uuid, p_version int)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.proposals;
begin
  if v_me is null or not public.is_allowlisted() then raise exception 'NOT_ALLOWED'; end if;
  select * into v_row from public.proposals where id = p_proposal for update;
  if not found or not exists (select 1 from public.proposal_members where proposal_id = p_proposal and user_id = v_me) then
    raise exception 'NOT_MEMBER';
  end if;
  if v_row.status = 'declined' then return 'declined'; end if;
  if v_row.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  if v_row.current_version <> p_version then raise exception 'STALE_VERSION'; end if;
  update public.proposals set status = 'declined', declined_by = v_me, updated_at = now() where id = p_proposal;
  return 'declined';
end;
$$;
grant execute on function public.decline_proposal(uuid, int) to authenticated;

-- "X of 6 have joined" for the empty state, without revealing anyone's email.
-- open = true when a whole domain is allowed (then there's no fixed total).
create function public.pilot_stats()
returns table (total int, joined int, open boolean)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*)::int from public.allowed_emails),
    (select count(*)::int from public.profiles p
       join auth.users u on u.id = p.id
     where p.completed and public.email_allowed(u.email)),
    exists (select 1 from public.allowed_domains)
  where public.is_allowlisted();
$$;
grant execute on function public.pilot_stats() to authenticated;


-- ----------------------------------------------------------------------------
-- 7. Keep updated_at fresh on profiles and plans.
-- ----------------------------------------------------------------------------
create function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger plans_touch before update on public.travel_plans for each row execute function public.touch_updated_at();

-- Signed-out visitors get nothing, anywhere in public.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;



-- ============================================================================
-- 8. Match / Discover / chat (same as migrations/005_trips_chat_groups.sql)
-- ============================================================================
-- ----------------------------------------------------------------------------
-- 1. Profile additions
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists vibes text[] not null default '{}'
  check (vibes <@ array['outdoors', 'food', 'nightlife', 'relaxed', 'culture', 'adventure']);
alter table public.profiles add column if not exists has_license boolean not null default false;
alter table public.profiles add column if not exists can_rent boolean not null default false;
alter table public.profiles add column if not exists group_pref_weekend text not null default 'any'
  check (group_pref_weekend in ('2', '3-4', '5-6', 'any'));
alter table public.profiles add column if not exists group_strict_weekend boolean not null default false;
alter table public.profiles add column if not exists group_pref_long text not null default 'any'
  check (group_pref_long in ('2', '3-4', '5-6', 'any'));
alter table public.profiles add column if not exists group_strict_long boolean not null default false;

do $$ begin
  -- You can only rent a car if you can drive.
  if not exists (select 1 from pg_constraint where conname = 'profiles_rent_needs_license') then
    alter table public.profiles add constraint profiles_rent_needs_license check (has_license or not can_rent);
  end if;
end $$;

-- Contact line (phone, WeChat, Instagram...). Private: only you can read it;
-- confirmed trip-mates see it through trip_contacts() below.
create table if not exists public.contacts (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  contact text not null default '' check (char_length(contact) <= 80)
);
alter table public.contacts enable row level security;
drop policy if exists "contacts: own" on public.contacts;
create policy "contacts: own" on public.contacts for all to authenticated
  using (user_id = auth.uid() and public.is_allowlisted())
  with check (user_id = auth.uid() and public.is_allowlisted());

-- ----------------------------------------------------------------------------
-- 2. Plan additions
-- ----------------------------------------------------------------------------
alter table public.travel_plans add column if not exists group_pref text
  check (group_pref is null or group_pref in ('2', '3-4', '5-6', 'any')); -- null = use profile default
alter table public.travel_plans add column if not exists group_strict boolean;  -- null = use profile default
alter table public.travel_plans add column if not exists willing_to_drive boolean not null default false;
alter table public.travel_plans add column if not exists status text not null default 'active'
  check (status in ('active', 'ended')); -- ended = "close the request" after no match
alter table public.travel_plans add column if not exists searching_since timestamptz not null default now();

-- Classmates' view: add the new columns; ended plans are no longer shown.
drop view if exists public.plan_cards;
create view public.plan_cards
with (security_invoker = false) as
  select id, user_id, timing_mode, break_id, date_mode, preferred_start, preferred_end, flex_days,
         weekends, trip_length_min, trip_length_max, destinations, destination_flex,
         budget_min, budget_max, vibes, bringing_car, seats_offered, bringing_gear,
         group_pref, group_strict, willing_to_drive, status, updated_at
  from public.travel_plans
  where public.is_allowlisted() and status = 'active';
revoke all on public.plan_cards from anon, authenticated;
grant select on public.plan_cards to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Trips = proposals with a chat, open spots and Discover publishing
-- ----------------------------------------------------------------------------
alter table public.proposals drop constraint if exists proposals_size_check;
alter table public.proposals add constraint proposals_size_check check (size between 1 and 12);
alter table public.proposals add column if not exists published boolean not null default false;
alter table public.proposals add column if not exists capacity int check (capacity is null or capacity between 1 and 12);
alter table public.proposals add column if not exists join_deadline timestamptz;
alter table public.proposals add column if not exists trip_kind text not null default 'long'
  check (trip_kind in ('weekend', 'long'));

alter table public.proposal_members add column if not exists joined_via text not null default 'match'
  check (joined_via in ('match', 'discover', 'host'));
alter table public.proposal_members add column if not exists joined_at timestamptz not null default now();
-- The group size this member last said "stay" at (for the "group grew" notice).
alter table public.proposal_members add column if not exists ack_size int;
update public.proposal_members m set ack_size = p.size from public.proposals p where p.id = m.proposal_id and m.ack_size is null;

-- Chat messages (members only).
create table if not exists public.trip_messages (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists trip_messages_by_trip on public.trip_messages (proposal_id, id);
alter table public.trip_messages enable row level security;
drop policy if exists "messages: members read" on public.trip_messages;
create policy "messages: members read" on public.trip_messages for select to authenticated
  using (public.is_allowlisted() and public.is_proposal_member(proposal_id));
drop policy if exists "messages: members write own" on public.trip_messages;
create policy "messages: members write own" on public.trip_messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_allowlisted() and public.is_proposal_member(proposal_id));

-- "Interested" taps on a potential trip (a set of plans, sorted ids "a,b,c").
create table if not exists public.match_interests (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  plan_key text not null check (char_length(plan_key) between 36 and 300),
  created_at timestamptz not null default now(),
  primary key (user_id, plan_key)
);
alter table public.match_interests enable row level security;
drop policy if exists "interests: read own" on public.match_interests;
create policy "interests: read own" on public.match_interests for select to authenticated
  using (user_id = auth.uid() and public.is_allowlisted());
drop policy if exists "interests: delete own" on public.match_interests;
create policy "interests: delete own" on public.match_interests for delete to authenticated
  using (user_id = auth.uid() and public.is_allowlisted());

-- ----------------------------------------------------------------------------
-- 4. Helpers
-- ----------------------------------------------------------------------------
-- The people behind a plan key, or null if the key is invalid (unsorted,
-- duplicates, missing or ended plans, or two plans of the same person).
create or replace function public.plan_key_members(p_plan_key text)
returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_plans uuid[];
  v_users uuid[];
begin
  begin
    v_plans := string_to_array(p_plan_key, ',')::uuid[];
  exception when others then
    return null;
  end;
  if cardinality(v_plans) not between 2 and 6
     or array_to_string(v_plans, ',') <> (select string_agg(x::text, ',' order by x) from unnest(v_plans) x)
     or (select count(distinct x) from unnest(v_plans) x) <> cardinality(v_plans) then
    return null;
  end if;
  select array_agg(distinct t.user_id order by t.user_id) into v_users
  from public.travel_plans t where t.id = any (v_plans) and t.status = 'active';
  if v_users is null or cardinality(v_users) <> cardinality(v_plans) then return null; end if;
  return v_users;
end;
$$;
revoke execute on function public.plan_key_members(text) from public, anon, authenticated;

-- Confirm a pending trip once everyone has accepted the current version, and
-- apply the "want more people?" answers from that version.
create or replace function public.confirm_if_everyone_accepted(p_proposal uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.proposals;
  v_merged jsonb;
  v_count int;
begin
  select * into v_row from public.proposals where id = p_proposal;
  if v_row.status <> 'pending' then return v_row.status; end if;
  select count(*) into v_count from public.proposal_approvals a
  join public.proposal_members m on m.proposal_id = a.proposal_id and m.user_id = a.user_id
  where a.proposal_id = p_proposal and a.version = v_row.current_version;
  if v_count < v_row.size then return 'pending'; end if;

  select merged into v_merged from public.proposal_versions where proposal_id = p_proposal and version = v_row.current_version;
  update public.proposals set
    status = 'confirmed',
    published = coalesce((v_merged #>> '{meta,wantMore}')::boolean, false),
    capacity = case when coalesce((v_merged #>> '{meta,wantMore}')::boolean, false)
                    then least(12, v_row.size + greatest(1, coalesce((v_merged #>> '{meta,extraSpots}')::int, 1))) end,
    join_deadline = (v_merged #>> '{meta,joinDeadline}')::timestamptz,
    updated_at = now()
  where id = p_proposal;
  insert into public.confirmed_itineraries (proposal_id, version, merged)
  values (p_proposal, v_row.current_version, v_merged)
  on conflict (proposal_id) do update set version = excluded.version, merged = excluded.merged, confirmed_at = now();
  update public.proposal_members set ack_size = v_row.size where proposal_id = p_proposal;
  return 'confirmed';
end;
$$;
revoke execute on function public.confirm_if_everyone_accepted(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Actions
-- ----------------------------------------------------------------------------

-- Tap "Interested" on a potential trip. Returns whether everyone is now
-- interested (then the server opens the group chat with start_trip).
create or replace function public.express_interest(p_plan_key text)
returns table (mutual boolean, interested int, needed int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_users uuid[];
  v_count int;
begin
  if v_me is null or not public.is_allowlisted() then raise exception 'NOT_ALLOWED'; end if;
  v_users := public.plan_key_members(p_plan_key);
  if v_users is null then raise exception 'BAD_INPUT: that trip is no longer available'; end if;
  if not (v_me = any (v_users)) then raise exception 'NOT_MEMBER'; end if;
  insert into public.match_interests (user_id, plan_key) values (v_me, p_plan_key) on conflict do nothing;
  select count(*) into v_count from public.match_interests where plan_key = p_plan_key and user_id = any (v_users);
  return query select v_count = cardinality(v_users), v_count, cardinality(v_users);
end;
$$;
grant execute on function public.express_interest(text) to authenticated;

-- For the Match list: how many people are interested in each potential trip
-- (only keys that include one of the caller's plans), and whether I am.
create or replace function public.interest_counts(p_keys text[])
returns table (plan_key text, interested int, mine boolean)
language sql stable security definer set search_path = ''
as $$
  select i.plan_key, count(*)::int, bool_or(i.user_id = auth.uid())
  from public.match_interests i
  where i.plan_key = any (p_keys)
    and public.is_allowlisted()
    and exists (select 1 from public.travel_plans t
                where t.user_id = auth.uid() and t.id = any (string_to_array(i.plan_key, ',')::uuid[]))
  group by i.plan_key;
$$;
grant execute on function public.interest_counts(text[]) to authenticated;

-- Open the group chat for a set of plans once everyone is interested.
-- Server only (it computes the suggested itinerary). Idempotent.
create or replace function public.start_trip(p_actor uuid, p_plan_key text, p_kind text, p_snapshots jsonb, p_merged jsonb)
returns table (proposal_id uuid, created boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_users uuid[];
  v_id uuid;
begin
  v_users := public.plan_key_members(p_plan_key);
  if v_users is null then raise exception 'BAD_INPUT: that trip is no longer available'; end if;
  if not (p_actor = any (v_users)) then raise exception 'NOT_MEMBER'; end if;
  if (select count(*) from public.match_interests where plan_key = p_plan_key and user_id = any (v_users)) < cardinality(v_users) then
    raise exception 'NOT_ALLOWED: not everyone is interested yet';
  end if;

  insert into public.proposals (member_key, plan_key, size, created_by, trip_kind)
  values (array_to_string(v_users, ','), p_plan_key, cardinality(v_users), p_actor, p_kind)
  on conflict (plan_key) where status = 'pending' do nothing
  returning id into v_id;
  if v_id is null then
    select p.id into v_id from public.proposals p where p.plan_key = p_plan_key and p.status = 'pending';
    return query select v_id, false;
    return;
  end if;
  insert into public.proposal_members (proposal_id, user_id, joined_via, ack_size)
  select v_id, u, 'match', cardinality(v_users) from unnest(v_users) u;
  -- Version 1 is the suggested itinerary. Nobody has accepted it yet.
  insert into public.proposal_versions (proposal_id, version, snapshots, merged, created_by)
  values (v_id, 1, p_snapshots, p_merged, p_actor);
  delete from public.match_interests where plan_key = p_plan_key;
  return query select v_id, true;
end;
$$;
revoke execute on function public.start_trip(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.start_trip(uuid, text, text, jsonb, jsonb) to service_role;

-- "I'm going no matter what": publish one of my plans straight to Discover as
-- a confirmed trip with open spots. Server only.
create or replace function public.host_trip(p_actor uuid, p_plan uuid, p_kind text, p_snapshots jsonb, p_merged jsonb, p_capacity int, p_deadline timestamptz)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.travel_plans where id = p_plan and user_id = p_actor and status = 'active') then
    raise exception 'NOT_MEMBER';
  end if;
  if p_capacity not between 2 and 12 then raise exception 'BAD_INPUT: spots'; end if;
  insert into public.proposals (member_key, plan_key, size, created_by, status, published, capacity, join_deadline, trip_kind)
  values (p_actor::text, p_plan::text, 1, p_actor, 'confirmed', true, p_capacity, p_deadline, p_kind)
  returning id into v_id;
  insert into public.proposal_members (proposal_id, user_id, joined_via, ack_size) values (v_id, p_actor, 'host', 1);
  insert into public.proposal_versions (proposal_id, version, snapshots, merged, created_by) values (v_id, 1, p_snapshots, p_merged, p_actor);
  insert into public.proposal_approvals (proposal_id, version, user_id) values (v_id, 1, p_actor);
  insert into public.confirmed_itineraries (proposal_id, version, merged) values (v_id, 1, p_merged);
  return v_id;
end;
$$;
revoke execute on function public.host_trip(uuid, uuid, text, jsonb, jsonb, int, timestamptz) from public, anon, authenticated;
grant execute on function public.host_trip(uuid, uuid, text, jsonb, jsonb, int, timestamptz) to service_role;

-- Submit the group's final plan (from the chat checklist) as a new version.
-- The submitter accepts it; everyone else accepts too before it's confirmed.
create or replace function public.submit_final_plan(p_actor uuid, p_proposal uuid, p_expected_version int, p_snapshots jsonb, p_merged jsonb, p_note text)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.proposals;
  v_next int;
begin
  select * into v_row from public.proposals where id = p_proposal for update;
  if not found or not exists (select 1 from public.proposal_members where proposal_id = p_proposal and user_id = p_actor) then
    raise exception 'NOT_MEMBER';
  end if;
  if v_row.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  if v_row.current_version <> p_expected_version then raise exception 'STALE_VERSION'; end if;
  v_next := v_row.current_version + 1;
  insert into public.proposal_versions (proposal_id, version, snapshots, merged, note, created_by)
  values (p_proposal, v_next, p_snapshots, p_merged, left(coalesce(p_note, ''), 300), p_actor);
  update public.proposals set current_version = v_next, updated_at = now() where id = p_proposal;
  insert into public.proposal_approvals (proposal_id, version, user_id) values (p_proposal, v_next, p_actor);
  perform public.confirm_if_everyone_accepted(p_proposal);
  return v_next;
end;
$$;
revoke execute on function public.submit_final_plan(uuid, uuid, int, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_final_plan(uuid, uuid, int, jsonb, jsonb, text) to service_role;

-- Accept the current version AS YOURSELF (now also handles publishing).
create or replace function public.accept_proposal(p_proposal uuid, p_version int)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.proposals;
begin
  if v_me is null or not public.is_allowlisted() then raise exception 'NOT_ALLOWED'; end if;
  select * into v_row from public.proposals where id = p_proposal for update;
  if not found or not exists (select 1 from public.proposal_members where proposal_id = p_proposal and user_id = v_me) then
    raise exception 'NOT_MEMBER';
  end if;
  if v_row.current_version <> p_version then raise exception 'STALE_VERSION'; end if;
  if v_row.status = 'confirmed' then return 'confirmed'; end if; -- harmless repeat click
  if v_row.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  insert into public.proposal_approvals (proposal_id, version, user_id) values (p_proposal, p_version, v_me) on conflict do nothing;
  return public.confirm_if_everyone_accepted(p_proposal);
end;
$$;

-- Join a published trip from Discover, instantly, while spots remain.
-- (To switch to host approval later: insert a "request" row here instead.)
create or replace function public.join_trip(p_proposal uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.proposals;
  v_pref text;
  v_strict boolean;
  v_new int;
begin
  if v_me is null or not public.is_allowlisted() then raise exception 'NOT_ALLOWED'; end if;
  if not exists (select 1 from public.profiles where id = v_me and completed) then raise exception 'NOT_ALLOWED: finish your profile first'; end if;
  select * into v_row from public.proposals where id = p_proposal for update;
  if not found or not v_row.published or v_row.status <> 'confirmed' then raise exception 'NOT_OPEN'; end if;
  if v_row.join_deadline is not null and v_row.join_deadline < now() then raise exception 'NOT_OPEN: sign-ups closed'; end if;
  if exists (select 1 from public.proposal_members where proposal_id = p_proposal and user_id = v_me) then return v_row.size; end if;
  if v_row.size >= coalesce(v_row.capacity, v_row.size) then raise exception 'FULL'; end if;

  -- Respect a Strict group-size preference: never join a trip that would be outside it.
  select case when v_row.trip_kind = 'weekend' then group_pref_weekend else group_pref_long end,
         case when v_row.trip_kind = 'weekend' then group_strict_weekend else group_strict_long end
    into v_pref, v_strict from public.profiles where id = v_me;
  v_new := v_row.size + 1;
  if v_strict and not (v_pref = 'any'
       or (v_pref = '2' and v_new = 2) or (v_pref = '3-4' and v_new between 3 and 4) or (v_pref = '5-6' and v_new between 5 and 6)) then
    raise exception 'GROUP_SIZE_STRICT';
  end if;

  insert into public.proposal_members (proposal_id, user_id, joined_via, ack_size) values (p_proposal, v_me, 'discover', v_new);
  insert into public.proposal_approvals (proposal_id, version, user_id) values (p_proposal, v_row.current_version, v_me) on conflict do nothing;
  update public.proposals set size = v_new, member_key = (
    select string_agg(user_id::text, ',' order by user_id) from public.proposal_members where proposal_id = p_proposal), updated_at = now()
  where id = p_proposal;
  return v_new;
end;
$$;
grant execute on function public.join_trip(uuid) to authenticated;

-- Leave a trip with one tap. Frees the spot. A pending match that drops below
-- two people ends ("match failed"); a confirmed trip with nobody left ends too.
create or replace function public.leave_trip(p_proposal uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.proposals;
  v_left int;
begin
  if v_me is null or not public.is_allowlisted() then raise exception 'NOT_ALLOWED'; end if;
  select * into v_row from public.proposals where id = p_proposal for update;
  if not found or not exists (select 1 from public.proposal_members where proposal_id = p_proposal and user_id = v_me) then
    raise exception 'NOT_MEMBER';
  end if;
  if v_row.status = 'declined' then return 'declined'; end if;
  delete from public.proposal_members where proposal_id = p_proposal and user_id = v_me;
  delete from public.proposal_approvals where proposal_id = p_proposal and user_id = v_me;
  v_left := v_row.size - 1;
  -- Don't suggest the same match to me again.
  insert into public.match_passes (user_id, target_key) values (v_me, v_row.plan_key) on conflict do nothing;

  if (v_row.status = 'pending' and v_left < 2) or v_left < 1 then
    update public.proposals set status = 'declined', declined_by = v_me, size = greatest(v_left, 1), updated_at = now() where id = p_proposal;
    return 'declined';
  end if;
  update public.proposals set size = v_left, member_key = (
    select string_agg(user_id::text, ',' order by user_id) from public.proposal_members where proposal_id = p_proposal), updated_at = now()
  where id = p_proposal;
  if v_row.status = 'pending' then return public.confirm_if_everyone_accepted(p_proposal); end if;
  return v_row.status;
end;
$$;
grant execute on function public.leave_trip(uuid) to authenticated;

-- "The group grew — I'm staying."
create or replace function public.ack_group_size(p_proposal uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.proposal_members m set ack_size = p.size
  from public.proposals p
  where p.id = p_proposal and m.proposal_id = p.id and m.user_id = auth.uid() and public.is_allowlisted();
$$;
grant execute on function public.ack_group_size(uuid) to authenticated;

-- Contact details for a CONFIRMED trip, for its members only:
-- name, USC email and the optional contact line.
create or replace function public.trip_contacts(p_proposal uuid)
returns table (user_id uuid, name text, email text, contact text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.display_name, u.email, coalesce(c.contact, '')
  from public.proposal_members m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  left join public.contacts c on c.user_id = m.user_id
  where m.proposal_id = p_proposal
    and public.is_allowlisted()
    and public.is_proposal_member(p_proposal)
    and exists (select 1 from public.proposals x where x.id = p_proposal and x.status = 'confirmed');
$$;
grant execute on function public.trip_contacts(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Discover: published trips with open spots, without names.
--    Shows the itinerary, spots, deadline and each member's non-identifying
--    travel style (year, pace, rhythm, vibes, car/driving).
-- ----------------------------------------------------------------------------
drop view if exists public.open_trips;
create view public.open_trips
with (security_invoker = false) as
  select p.id, p.size, p.capacity, p.join_deadline, p.trip_kind, p.created_at, ci.merged,
         exists (select 1 from public.proposal_members me where me.proposal_id = p.id and me.user_id = auth.uid()) as is_member,
         (select jsonb_agg(jsonb_build_object(
                   'year', pr.msba_year, 'pace', pr.pace, 'schedule', pr.schedule, 'vibes', pr.vibes,
                   'experience', pr.travel_experience, 'has_car', pr.has_car, 'can_drive', pr.has_license))
            from public.proposal_members m join public.profiles pr on pr.id = m.user_id
           where m.proposal_id = p.id) as members
  from public.proposals p
  join public.confirmed_itineraries ci on ci.proposal_id = p.id
  where public.is_allowlisted() and p.published and p.status = 'confirmed'
    and (p.join_deadline is null or p.join_deadline > now());
revoke all on public.open_trips from anon, authenticated;
grant select on public.open_trips to authenticated;

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

-- ============================================================================
-- 9. Booked plans: a plan that's part of a confirmed trip is "booked".
-- Booked plans are no longer matched (no double-booking the same break) and
-- no longer listed under Discover's classmates' plans. If the person leaves
-- that trip, the plan is matched again automatically. Safe to run twice.
-- ============================================================================

create or replace function public.plan_is_booked(p_plan uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.proposals p
    join public.proposal_members m on m.proposal_id = p.id and m.user_id = p_user
    where p.status = 'confirmed' and p_plan::text = any (string_to_array(p.plan_key, ','))
  );
$$;
revoke all on function public.plan_is_booked(uuid, uuid) from public, anon;
-- The plan_cards view calls this as the signed-in user, so they need to run it.
grant execute on function public.plan_is_booked(uuid, uuid) to authenticated;

drop view if exists public.plan_cards;
create view public.plan_cards
with (security_invoker = false) as
  select id, user_id, timing_mode, break_id, date_mode, preferred_start, preferred_end, flex_days,
         weekends, trip_length_min, trip_length_max, destinations, destination_flex,
         budget_min, budget_max, vibes, bringing_car, seats_offered, bringing_gear,
         group_pref, group_strict, willing_to_drive, status, updated_at
  from public.travel_plans
  where public.is_allowlisted() and status = 'active' and not public.plan_is_booked(id, user_id);
revoke all on public.plan_cards from anon, authenticated;
grant select on public.plan_cards to authenticated;

-- Interested / start a trip: every plan must be active AND not booked.
create or replace function public.plan_key_members(p_plan_key text)
returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_plans uuid[];
  v_users uuid[];
begin
  begin
    v_plans := string_to_array(p_plan_key, ',')::uuid[];
  exception when others then
    return null;
  end;
  if cardinality(v_plans) not between 2 and 6
     or array_to_string(v_plans, ',') <> (select string_agg(x::text, ',' order by x) from unnest(v_plans) x)
     or (select count(distinct x) from unnest(v_plans) x) <> cardinality(v_plans) then
    return null;
  end if;
  select array_agg(distinct t.user_id order by t.user_id) into v_users
  from public.travel_plans t
  where t.id = any (v_plans) and t.status = 'active' and not public.plan_is_booked(t.id, t.user_id);
  if v_users is null or cardinality(v_users) <> cardinality(v_plans) then return null; end if;
  return v_users;
end;
$$;

-- ==== STORAGE (profile photos) =================================================
-- A private bucket. Max 2 MB, images only. Allowlisted users can view photos;
-- you can only upload/replace/delete files inside a folder named after your
-- own user id (for example "8c1f.../avatar.jpg").
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: allowlisted can view" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_allowlisted());
create policy "avatars: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_allowlisted() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_allowlisted() and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and public.is_allowlisted() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_allowlisted() and (storage.foldername(name))[1] = auth.uid()::text);
