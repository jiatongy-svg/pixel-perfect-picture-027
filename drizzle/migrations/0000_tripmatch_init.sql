CREATE TABLE public.trip_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  first_name text NOT NULL,
  msba_year text NOT NULL DEFAULT 'MSBA 2027',
  break_id text NOT NULL,
  vibes text[] NOT NULL DEFAULT '{}',
  destinations text[] NOT NULL DEFAULT '{}',
  start_date date NOT NULL,
  end_date date NOT NULL,
  budget text NOT NULL,
  gear text[] NOT NULL DEFAULT '{}',
  is_seed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.trip_profiles TO service_role;
ALTER TABLE public.trip_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id uuid NOT NULL REFERENCES public.trip_profiles(id) ON DELETE CASCADE,
  match_profile_id uuid NOT NULL REFERENCES public.trip_profiles(id) ON DELETE CASCADE,
  merged jsonb NOT NULL,
  source text NOT NULL DEFAULT 'rules',
  status text NOT NULL DEFAULT 'proposed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.proposals TO service_role;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

INSERT INTO public.trip_profiles (email, first_name, msba_year, break_id, vibes, destinations, start_date, end_date, budget, gear, is_seed) VALUES
('aisha.seed@usc.edu','Aisha','MSBA 2026','thanksgiving',ARRAY['Touristy']::text[],ARRAY['Joshua Tree','San Diego']::text[],'2026-11-26','2026-11-29','700plus',ARRAY['tent']::text[],true),
('ben.seed@usc.edu','Ben','MSBA 2027','thanksgiving',ARRAY['Artsy']::text[],ARRAY['Zion & Bryce','San Diego','Las Vegas']::text[],'2026-11-26','2026-11-30','under300',ARRAY['car']::text[],true),
('chloe.seed@usc.edu','Chloe','MSBA 2026','thanksgiving',ARRAY['Adventure']::text[],ARRAY['Yosemite','Zion & Bryce','Las Vegas']::text[],'2026-11-26','2026-11-29','300-700',ARRAY['tent']::text[],true),
('diego.seed@usc.edu','Diego','MSBA 2026','thanksgiving',ARRAY['Adventure']::text[],ARRAY['Las Vegas','Zion & Bryce','Yosemite']::text[],'2026-11-28','2026-11-30','300-700',ARRAY['tent']::text[],true),
('emma.seed@usc.edu','Emma','MSBA 2027','thanksgiving',ARRAY['Relaxed']::text[],ARRAY['San Diego','Zion & Bryce']::text[],'2026-11-29','2026-12-01','300-700',ARRAY['tent']::text[],true),
('farhan.seed@usc.edu','Farhan','MSBA 2026','thanksgiving',ARRAY['Artsy']::text[],ARRAY['Joshua Tree','Zion & Bryce','Yosemite']::text[],'2026-11-25','2026-11-28','700plus',ARRAY['car','tent']::text[],true),
('grace.seed@usc.edu','Grace','MSBA 2026','thanksgiving',ARRAY['Touristy','Relaxed']::text[],ARRAY['Zion & Bryce','Joshua Tree','Yosemite']::text[],'2026-11-23','2026-11-27','700plus',ARRAY['car']::text[],true),
('hiro.seed@usc.edu','Hiro','MSBA 2027','thanksgiving',ARRAY['Adventure','Touristy']::text[],ARRAY['Yosemite','Las Vegas']::text[],'2026-11-27','2026-11-30','300-700',ARRAY['car']::text[],true),
('isla.seed@usc.edu','Isla','MSBA 2026','thanksgiving',ARRAY['Touristy']::text[],ARRAY['Las Vegas','Joshua Tree','Zion & Bryce']::text[],'2026-11-26','2026-11-28','under300','{}'::text[],true),
('jae.seed@usc.edu','Jae','MSBA 2027','thanksgiving',ARRAY['Touristy','Adventure']::text[],ARRAY['San Diego','Joshua Tree','Zion & Bryce']::text[],'2026-11-25','2026-11-27','under300','{}'::text[],true),
('kavya.seed@usc.edu','Kavya','MSBA 2027','thanksgiving',ARRAY['Artsy']::text[],ARRAY['Joshua Tree','Las Vegas']::text[],'2026-11-25','2026-11-28','300-700','{}'::text[],true),
('liam.seed@usc.edu','Liam','MSBA 2027','thanksgiving',ARRAY['Artsy','Relaxed']::text[],ARRAY['Zion & Bryce','Las Vegas','Yosemite']::text[],'2026-11-27','2026-12-01','700plus',ARRAY['tent']::text[],true),
('maya.seed@usc.edu','Maya','MSBA 2026','thanksgiving',ARRAY['Artsy']::text[],ARRAY['Yosemite','Joshua Tree']::text[],'2026-11-26','2026-11-29','700plus',ARRAY['car','tent']::text[],true),
('noah.seed@usc.edu','Noah','MSBA 2027','winter',ARRAY['Adventure','Relaxed']::text[],ARRAY['Big Bear (ski)','Seattle']::text[],'2026-12-19','2026-12-22','700plus','{}'::text[],true),
('olivia.seed@usc.edu','Olivia','MSBA 2026','winter',ARRAY['Relaxed','Artsy']::text[],ARRAY['San Francisco','Mammoth Lakes','Tokyo']::text[],'2026-12-25','2026-12-28','300-700','{}'::text[],true),
('priya.seed@usc.edu','Priya','MSBA 2026','winter',ARRAY['Artsy','Adventure']::text[],ARRAY['Mammoth Lakes','San Francisco']::text[],'2026-12-20','2026-12-24','under300','{}'::text[],true),
('quinn.seed@usc.edu','Quinn','MSBA 2027','winter',ARRAY['Adventure']::text[],ARRAY['Seattle','San Francisco']::text[],'2026-12-27','2026-12-30','under300',ARRAY['car','tent']::text[],true),
('rohan.seed@usc.edu','Rohan','MSBA 2027','winter',ARRAY['Relaxed']::text[],ARRAY['Tokyo','Big Bear (ski)','Seattle']::text[],'2026-12-26','2027-01-02','300-700','{}'::text[],true),
('sofia.seed@usc.edu','Sofia','MSBA 2026','winter',ARRAY['Touristy','Artsy']::text[],ARRAY['Big Bear (ski)','Mammoth Lakes']::text[],'2026-12-18','2026-12-21','under300',ARRAY['car','tent']::text[],true),
('tyler.seed@usc.edu','Tyler','MSBA 2027','spring',ARRAY['Touristy']::text[],ARRAY['Cabo San Lucas','Hawaii (Oahu)','New York City']::text[],'2027-03-12','2027-03-16','under300',ARRAY['tent']::text[],true),
('uma.seed@usc.edu','Uma','MSBA 2026','spring',ARRAY['Artsy']::text[],ARRAY['Cancun','New York City']::text[],'2027-03-16','2027-03-21','under300','{}'::text[],true),
('victor.seed@usc.edu','Victor','MSBA 2027','spring',ARRAY['Touristy','Adventure']::text[],ARRAY['Hawaii (Oahu)','Grand Canyon & Sedona']::text[],'2027-03-13','2027-03-18','300-700',ARRAY['tent']::text[],true),
('wen.seed@usc.edu','Wen','MSBA 2027','spring',ARRAY['Relaxed']::text[],ARRAY['Grand Canyon & Sedona','New York City']::text[],'2027-03-15','2027-03-19','under300',ARRAY['car','tent']::text[],true),
('ximena.seed@usc.edu','Ximena','MSBA 2027','spring',ARRAY['Adventure','Touristy']::text[],ARRAY['New York City','Cancun','Cabo San Lucas']::text[],'2027-03-12','2027-03-16','700plus',ARRAY['car']::text[],true),
('yusuf.seed@usc.edu','Yusuf','MSBA 2027','spring',ARRAY['Adventure','Touristy']::text[],ARRAY['Cabo San Lucas','Grand Canyon & Sedona','Cancun']::text[],'2027-03-12','2027-03-16','300-700','{}'::text[],true),
('zoe.seed@usc.edu','Zoe','MSBA 2027','weekend',ARRAY['Adventure']::text[],ARRAY['Santa Barbara','Palm Springs']::text[],'2026-11-07','2026-11-08','700plus',ARRAY['car','tent']::text[],true),
('arjun.seed@usc.edu','Arjun','MSBA 2026','weekend',ARRAY['Artsy']::text[],ARRAY['Malibu & El Matador Beach','Santa Barbara','San Diego']::text[],'2026-11-07','2026-11-07','700plus',ARRAY['car']::text[],true),
('bella.seed@usc.edu','Bella','MSBA 2027','weekend',ARRAY['Artsy']::text[],ARRAY['Palm Springs','Malibu & El Matador Beach','San Diego']::text[],'2026-11-07','2026-11-08','under300',ARRAY['car']::text[],true),
('carlos.seed@usc.edu','Carlos','MSBA 2027','weekend',ARRAY['Relaxed','Adventure']::text[],ARRAY['Catalina Island','Malibu & El Matador Beach','Santa Barbara']::text[],'2026-11-07','2026-11-08','300-700',ARRAY['car']::text[],true),
('dana.seed@usc.edu','Dana','MSBA 2026','weekend',ARRAY['Relaxed']::text[],ARRAY['San Diego','Malibu & El Matador Beach']::text[],'2026-11-07','2026-11-08','under300',ARRAY['car','tent']::text[],true);