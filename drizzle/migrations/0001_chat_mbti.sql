-- Run once in the project's SQL editor before enabling persistent MBTI/chat.
ALTER TABLE public.trip_profiles ADD COLUMN IF NOT EXISTS mbti text;
ALTER TABLE public.trip_profiles ADD CONSTRAINT trip_profiles_mbti_check CHECK (mbti IS NULL OR mbti ~ '^[IE][NS][TF][JP]$');
CREATE TABLE public.trip_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  author_profile_id uuid NOT NULL REFERENCES public.trip_profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (author_profile_id, client_id)
);
CREATE INDEX trip_messages_thread_time ON public.trip_messages(proposal_id, created_at, id);
ALTER TABLE public.trip_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_messages FROM anon;
GRANT SELECT, INSERT ON public.trip_messages TO authenticated;
GRANT ALL ON public.trip_messages TO service_role;

CREATE FUNCTION public.can_read_trip_chat(thread_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.proposals p
  JOIN public.trip_profiles a ON a.id = p.user_profile_id
  JOIN public.trip_profiles b ON b.id = p.match_profile_id
  JOIN auth.users u ON u.id = auth.uid()
  WHERE p.id = thread_id AND p.status = 'accepted'
   AND NOT a.is_seed AND NOT b.is_seed AND u.email_confirmed_at IS NOT NULL
   AND lower(u.email) IN (lower(a.email), lower(b.email))
 );
$$;
REVOKE ALL ON FUNCTION public.can_read_trip_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_trip_chat(uuid) TO authenticated, service_role;
CREATE POLICY trip_messages_read ON public.trip_messages FOR SELECT TO authenticated
 USING (public.can_read_trip_chat(proposal_id));
CREATE FUNCTION public.can_author_trip_chat(thread_id uuid, profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.can_read_trip_chat(thread_id) AND EXISTS (
  SELECT 1 FROM public.trip_profiles p JOIN auth.users u ON u.id = auth.uid()
  JOIN public.proposals t ON t.id = thread_id
  WHERE p.id = profile_id AND p.id IN (t.user_profile_id, t.match_profile_id)
   AND NOT p.is_seed AND lower(p.email) = lower(u.email) AND u.email_confirmed_at IS NOT NULL
 );
$$;
REVOKE ALL ON FUNCTION public.can_author_trip_chat(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_author_trip_chat(uuid, uuid) TO authenticated, service_role;
CREATE POLICY trip_messages_insert ON public.trip_messages FOR INSERT TO authenticated
 WITH CHECK (public.can_author_trip_chat(proposal_id, author_profile_id));
