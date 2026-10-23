-- ============================================================================
-- 006: a plan that's part of a confirmed trip is "booked".
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
