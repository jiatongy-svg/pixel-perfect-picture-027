-- ============================================================================
-- 007: one plan, one confirmed trip.
-- A plan can be in several trips that are still being worked out (ty + Hazel,
-- ty + Jamie). Once one of them is confirmed, the others can't be confirmed
-- with that plan: sending a final plan or accepting is refused, and the trip
-- room says whose plan is already booked. Needs 005 and 006. Safe to run twice.
-- ============================================================================

-- The member (name) whose plan in this still-pending trip is already booked in
-- a confirmed trip, or null. Members of the trip (and the server) can ask.
create or replace function public.booked_member(p_proposal uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select pr.display_name
  from public.proposals p
  join public.travel_plans t on t.id::text = any (string_to_array(p.plan_key, ','))
  join public.proposal_members m on m.proposal_id = p.id and m.user_id = t.user_id
  join public.profiles pr on pr.id = t.user_id
  where p.id = p_proposal and p.status = 'pending'
    and (auth.uid() is null or exists (select 1 from public.proposal_members me where me.proposal_id = p.id and me.user_id = auth.uid()))
    and public.plan_is_booked(t.id, t.user_id)
  order by pr.display_name
  limit 1;
$$;
revoke all on function public.booked_member(uuid) from public, anon;
grant execute on function public.booked_member(uuid) to authenticated;

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
  -- One plan, one confirmed trip. Lock this trip's plans (so two trips can't
  -- confirm the same plan at the same moment), then check none is booked.
  perform pg_advisory_xact_lock(hashtext('plan:' || x)) from unnest(string_to_array(v_row.plan_key, ',')) x order by x;
  if public.booked_member(p_proposal) is not null then return 'pending'; end if;

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
  if public.booked_member(p_proposal) is not null then raise exception 'ALREADY_BOOKED'; end if;
  insert into public.proposal_approvals (proposal_id, version, user_id) values (p_proposal, p_version, v_me) on conflict do nothing;
  return public.confirm_if_everyone_accepted(p_proposal);
end;
$$;

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
  if public.booked_member(p_proposal) is not null then raise exception 'ALREADY_BOOKED'; end if;
  v_next := v_row.current_version + 1;
  insert into public.proposal_versions (proposal_id, version, snapshots, merged, note, created_by)
  values (p_proposal, v_next, p_snapshots, p_merged, left(coalesce(p_note, ''), 300), p_actor);
  update public.proposals set current_version = v_next, updated_at = now() where id = p_proposal;
  insert into public.proposal_approvals (proposal_id, version, user_id) values (p_proposal, v_next, p_actor);
  perform public.confirm_if_everyone_accepted(p_proposal);
  return v_next;
end;
$$;
