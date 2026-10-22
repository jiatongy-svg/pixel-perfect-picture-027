-- ============================================================================
-- Upgrade 003: destinations anywhere in the world + optional MBTI.
--
-- HOW TO USE: Supabase -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run on the existing database, and safe to run twice.
--
-- What it changes:
--   * travel_plans.destinations: from a list of quick-pick ids (text[]) to a
--     list of places with names and coordinates (jsonb), so students can pick
--     any city. Existing plans are converted automatically; nothing is lost.
--   * profiles.mbti: new optional column.
-- ============================================================================

-- 1. MBTI (optional)
alter table public.profiles add column if not exists mbti text
  check (mbti is null or mbti in ('ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'));

-- 2. Destinations as places. The view depends on the column, so drop it first.
drop view if exists public.plan_cards;

do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'travel_plans' and column_name = 'destinations') = 'ARRAY' then
    alter table public.travel_plans add column places jsonb not null default '[]'::jsonb;
    -- Convert each saved quick-pick id into a full place, keeping the order.
    update public.travel_plans t set places = coalesce((
      select jsonb_agg(jsonb_build_object('key', c.id, 'name', c.name, 'country', c.country, 'lat', c.lat, 'lon', c.lon) order by d.ord)
      from unnest(t.destinations) with ordinality as d(id, ord)
      join (values
        ('san-diego', 'San Diego', 'United States', 32.7157, -117.1611),
        ('santa-barbara', 'Santa Barbara', 'United States', 34.4208, -119.6982),
        ('malibu', 'Malibu coast', 'United States', 34.0259, -118.7798),
        ('catalina', 'Catalina Island', 'United States', 33.3879, -118.4163),
        ('joshua-tree', 'Joshua Tree', 'United States', 33.8734, -115.901),
        ('palm-springs', 'Palm Springs', 'United States', 33.8303, -116.5453),
        ('big-bear', 'Big Bear', 'United States', 34.2439, -116.9114),
        ('mammoth', 'Mammoth Lakes', 'United States', 37.6485, -118.9721),
        ('yosemite', 'Yosemite', 'United States', 37.8651, -119.5383),
        ('las-vegas', 'Las Vegas', 'United States', 36.1699, -115.1398),
        ('zion-bryce', 'Zion & Bryce', 'United States', 37.2982, -113.0263),
        ('grand-canyon-sedona', 'Grand Canyon & Sedona', 'United States', 36.0544, -112.1401),
        ('big-sur', 'Big Sur', 'United States', 36.2704, -121.8081),
        ('san-francisco', 'San Francisco', 'United States', 37.7749, -122.4194),
        ('seattle', 'Seattle', 'United States', 47.6062, -122.3321),
        ('new-york', 'New York City', 'United States', 40.7128, -74.006),
        ('oahu', 'Oahu, Hawaii', 'United States', 21.4389, -158.0001),
        ('cabo', 'Cabo San Lucas', 'Mexico', 22.8905, -109.9167),
        ('cancun', 'Cancún & Tulum', 'Mexico', 21.1619, -86.8515),
        ('tokyo', 'Tokyo', 'Japan', 35.6762, 139.6503)
      ) as c(id, name, country, lat, lon) on c.id = d.id
    ), '[]'::jsonb);
    -- Dropping the old column also drops the old checks that used it.
    alter table public.travel_plans drop column destinations;
    alter table public.travel_plans rename column places to destinations;
    alter table public.travel_plans
      add constraint travel_plans_destinations_shape check (case when jsonb_typeof(destinations) = 'array' then jsonb_array_length(destinations) <= 5 else false end),
      add constraint travel_plans_destinations_needed check (destination_flex = 'open' or (case when jsonb_typeof(destinations) = 'array' then jsonb_array_length(destinations) >= 1 else false end));
  end if;
end $$;

-- 3. Recreate the classmates' view (same columns as before).
create view public.plan_cards
with (security_invoker = false) as
  select user_id, timing_mode, break_id, date_mode, preferred_start, preferred_end, flex_days,
         weekends, trip_length_min, trip_length_max, destinations, destination_flex,
         budget_min, budget_max, vibes, bringing_car, seats_offered, bringing_gear, updated_at
  from public.travel_plans
  where public.is_allowlisted();
revoke all on public.plan_cards from anon, authenticated;
grant select on public.plan_cards to authenticated;
