create table if not exists public.daily_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, date)
);

create index if not exists daily_plans_user_updated_idx
  on public.daily_plans (user_id, updated_at desc);

drop trigger if exists daily_plans_set_updated_at on public.daily_plans;
create trigger daily_plans_set_updated_at
before update on public.daily_plans
for each row execute function public.set_updated_at();

alter table public.daily_plans enable row level security;

drop policy if exists "daily_plans_owner_all" on public.daily_plans;
create policy "daily_plans_owner_all" on public.daily_plans
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
