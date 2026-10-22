-- ============================================================================
-- Upgrade: open TripMatch to every @usc.edu address.
--
-- HOW TO USE: Supabase -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run on the existing database (and safe to run twice): no data is changed or deleted.
-- After this, anyone with a @usc.edu email can sign in with a code.
-- To go back to "only the listed emails": run
--   delete from public.allowed_domains where domain = 'usc.edu';
-- ============================================================================

create table if not exists public.allowed_domains (
  domain text primary key check (domain = lower(domain) and domain not like '%@%'),
  created_at timestamptz not null default now()
);
alter table public.allowed_domains enable row level security;
revoke all on public.allowed_domains from anon, authenticated;

-- Is this email allowed in? (listed individually, or its domain is open)
-- "security definer" = runs with the table owner's rights so it can read the
-- allowlist tables, while callers still can't read them directly.
create or replace function public.email_allowed(p_email text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.allowed_emails where email = lower(p_email))
      or exists (select 1 from public.allowed_domains where domain = lower(split_part(p_email, '@', 2)));
$$;
revoke execute on function public.email_allowed(text) from public, anon, authenticated;
grant execute on function public.email_allowed(text) to service_role;

create or replace function public.is_allowlisted()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.email_allowed(u.email) from auth.users u where u.id = auth.uid()), false);
$$;

create or replace function public.create_proposal(p_actor uuid, p_members uuid[], p_snapshots jsonb, p_merged jsonb)
returns table (proposal_id uuid, created boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_members uuid[];
  v_key text;
  v_id uuid;
  v_ok int;
begin
  select array_agg(distinct m order by m) into v_members from unnest(p_members) as m;
  if v_members is null or cardinality(v_members) not between 2 and 4 or cardinality(v_members) <> cardinality(p_members) then
    raise exception 'BAD_INPUT: a proposal needs 2 to 4 different people';
  end if;
  if not (p_actor = any (v_members)) then
    raise exception 'NOT_MEMBER';
  end if;
  -- Every member must be allowlisted, have a completed profile and a plan.
  select count(*) into v_ok
  from public.profiles p
  join auth.users u on u.id = p.id
  join public.travel_plans t on t.user_id = p.id
  where p.id = any (v_members) and p.completed and public.email_allowed(u.email);
  if v_ok <> cardinality(v_members) then
    raise exception 'NOT_ALLOWED: every member needs a completed profile and a saved plan';
  end if;

  v_key := array_to_string(v_members, ',');

  insert into public.proposals (member_key, size, created_by)
  values (v_key, cardinality(v_members), p_actor)
  on conflict (member_key) where status = 'pending' do nothing
  returning id into v_id;

  if v_id is null then
    -- Someone (maybe this same double-click) already opened one for this group.
    select p.id into v_id from public.proposals p where p.member_key = v_key and p.status = 'pending';
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

drop function if exists public.pilot_stats();
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

-- Open the doors to USC.
insert into public.allowed_domains (domain) values ('usc.edu') on conflict do nothing;
