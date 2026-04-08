alter table public.profiles
  add column if not exists daily_plan_snapshots jsonb not null default '[]'::jsonb;
