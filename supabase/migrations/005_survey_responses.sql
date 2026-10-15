-- FieldOS migration 005: public pre-launch survey (page: /survey, no login needed).
-- Anyone with the link may ADD one answer. Nobody can read, change or delete answers
-- through the app or its public key. Only the founder (Supabase dashboard / Claude via
-- the Supabase tool) can read them.

create table if not exists public.survey_responses (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  role             text not null check (role in ('mr','abm','manager','other')),
  challenges       text[] not null default '{}'
                   check (challenges <@ array['planning','target','followups','late_home','stress','reporting','other']::text[]),
  planning_method  text check (planning_method in ('head','diary','company_app','excel','other')),
  hardest_part     text check (char_length(hardest_part) <= 1000),
  one_fix          text check (char_length(one_fix) <= 1000),
  would_try        text not null check (would_try in ('yes','maybe','no')),
  opinion          text check (char_length(opinion) <= 1000),
  name             text check (char_length(name) <= 80),
  whatsapp         text check (whatsapp ~ '^[0-9]{10}$'),
  city             text check (char_length(city) <= 80),
  source           text check (char_length(source) <= 40)
);

alter table public.survey_responses enable row level security;

-- Insert only. No select/update/delete grant or policy for the public key.
revoke all on public.survey_responses from anon, authenticated;
grant insert on public.survey_responses to anon, authenticated;

drop policy if exists survey_insert on public.survey_responses;
create policy survey_insert on public.survey_responses
  for insert to anon, authenticated
  with check (true);  -- the column checks above do the validation
