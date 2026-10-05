-- FieldOS Milestone 5: Health check-in fields
-- Adds the three fields needed by the HEALTH experience.
-- Safe to run more than once.

alter table public.health_checkins
  add column if not exists pressure_tags text[] not null default '{}',
  add column if not exists day_weight text,
  add column if not exists home_time_status text;

-- Keep the allowed values clear and consistent.
alter table public.health_checkins
  drop constraint if exists health_checkins_day_weight_check;

alter table public.health_checkins
  add constraint health_checkins_day_weight_check
  check (day_weight is null or day_weight in ('light', 'normal', 'heavy'));

alter table public.health_checkins
  drop constraint if exists health_checkins_home_time_status_check;

alter table public.health_checkins
  add constraint health_checkins_home_time_status_check
  check (home_time_status is null or home_time_status in ('on_time', 'probably_late', 'late'));
