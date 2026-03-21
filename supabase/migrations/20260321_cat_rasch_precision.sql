alter table public.profiles
  add column if not exists cat_se double precision not null default 1.15;

update public.profiles
set cat_se = coalesce(cat_se, 1.15);

alter table public.cat_sessions
  add column if not exists se_before double precision,
  add column if not exists se_after double precision,
  add column if not exists target_se double precision,
  add column if not exists stop_reason text,
  add column if not exists item_count integer,
  add column if not exists quality_tier text,
  add column if not exists session_blueprint jsonb not null default '{}'::jsonb;

create table if not exists public.cat_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item_order integer not null,
  item_type text,
  item_difficulty double precision not null default 0,
  user_answer jsonb,
  is_correct boolean not null default false,
  latency_ms integer not null default 0,
  info_gain double precision not null default 0,
  theta_before double precision,
  theta_after double precision,
  created_at timestamptz not null default timezone('utc', now()),
  unique (session_id, item_order)
);

create index if not exists cat_session_items_session_idx
  on public.cat_session_items (session_id, item_order);

create index if not exists cat_session_items_user_created_idx
  on public.cat_session_items (user_id, created_at desc);

alter table public.cat_session_items enable row level security;

drop policy if exists "cat_session_items_owner_select" on public.cat_session_items;
create policy "cat_session_items_owner_select" on public.cat_session_items
for select using (auth.uid() = user_id);

drop policy if exists "cat_session_items_owner_insert" on public.cat_session_items;
create policy "cat_session_items_owner_insert" on public.cat_session_items
for insert with check (auth.uid() = user_id);
