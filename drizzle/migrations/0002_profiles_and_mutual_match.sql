ALTER TABLE public.trip_profiles ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.proposals ADD COLUMN accepted_by uuid[] NOT NULL DEFAULT '{}';
-- Previous one-sided real acceptances now await the second traveler. Samples
-- remain clearly marked demonstrations rather than messages to real classmates.
UPDATE public.proposals p SET accepted_by = ARRAY[p.user_profile_id], status = CASE
 WHEN EXISTS (SELECT 1 FROM public.trip_profiles t WHERE t.id = p.match_profile_id AND t.is_seed) THEN 'accepted' ELSE 'proposed' END
 WHERE p.status = 'accepted';

CREATE FUNCTION public.decide_trip_plan(p_proposal uuid, p_actor uuid, p_status text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.proposals; is_sample boolean; next_acceptances uuid[]; next_status text;
BEGIN
 SELECT * INTO p FROM public.proposals WHERE id = p_proposal FOR UPDATE;
 IF NOT FOUND OR p_actor IS NULL OR p_actor NOT IN (p.user_profile_id, p.match_profile_id) THEN RAISE EXCEPTION 'Not a plan member'; END IF;
 IF p.status = 'passed' THEN RAISE EXCEPTION 'Plan is closed'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('accepted', 'passed') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF p_status = 'passed' THEN UPDATE public.proposals SET status = 'passed', accepted_by = '{}', updated_at = now() WHERE id = p.id; RETURN 'passed'; END IF;
 SELECT EXISTS (SELECT 1 FROM public.trip_profiles t WHERE t.id IN (p.user_profile_id, p.match_profile_id) AND t.is_seed) INTO is_sample;
 SELECT ARRAY(SELECT DISTINCT x FROM unnest(p.accepted_by || ARRAY[p_actor]) x) INTO next_acceptances;
 next_status := CASE WHEN is_sample OR (p.user_profile_id = ANY(next_acceptances) AND p.match_profile_id = ANY(next_acceptances)) THEN 'accepted' ELSE 'proposed' END;
 UPDATE public.proposals SET status = next_status, accepted_by = next_acceptances, updated_at = now() WHERE id = p.id;
 RETURN next_status;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_trip_plan(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_trip_plan(uuid, uuid, text) TO service_role;

-- Reapply the chat gate for existing installations of migration 0001.
CREATE OR REPLACE FUNCTION public.can_read_trip_chat(thread_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.proposals p
  JOIN public.trip_profiles a ON a.id = p.user_profile_id
  JOIN public.trip_profiles b ON b.id = p.match_profile_id
  JOIN auth.users u ON u.id = auth.uid()
  WHERE p.id = thread_id AND p.status = 'accepted'
   AND a.id = ANY(p.accepted_by) AND b.id = ANY(p.accepted_by)
   AND NOT a.is_seed AND NOT b.is_seed AND u.email_confirmed_at IS NOT NULL
   AND lower(u.email) IN (lower(a.email), lower(b.email))
 );
$$;
