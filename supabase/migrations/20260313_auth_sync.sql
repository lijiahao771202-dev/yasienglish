create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  translation_elo integer not null default 600,
  listening_elo integer not null default 600,
  streak_count integer not null default 0,
  listening_streak integer not null default 0,
  max_translation_elo integer not null default 600,
  max_listening_elo integer not null default 600,
  coins integer not null default 0,
  inventory jsonb not null default '{"capsule": 15, "hint_ticket": 3, "vocab_ticket": 2, "audio_ticket": 2, "refresh_ticket": 2}'::jsonb,
  owned_themes text[] not null default array['morning_coffee'],
  active_theme text not null default 'morning_coffee',
  last_practice_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  word_key text not null,
  definition text not null default '',
  translation text not null default '',
  context text not null default '',
  example text not null default '',
  timestamp_ms bigint not null,
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  state integer not null default 0,
  last_review_ms bigint not null default 0,
  due_ms bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, word_key)
);

create table if not exists public.writing_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  article_title text not null,
  content text not null,
  score double precision not null,
  timestamp_ms bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.elo_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('translation', 'listening')),
  elo integer not null,
  change integer not null,
  source text not null default 'battle',
  timestamp_ms bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.read_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  read_at timestamptz not null,
  timestamp_ms bigint not null,
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, url)
);

create index if not exists vocabulary_user_updated_idx on public.vocabulary (user_id, updated_at desc);
create index if not exists writing_history_user_timestamp_idx on public.writing_history (user_id, timestamp_ms desc);
create index if not exists elo_history_user_timestamp_idx on public.elo_history (user_id, timestamp_ms asc);
create index if not exists read_articles_user_updated_idx on public.read_articles (user_id, updated_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists vocabulary_set_updated_at on public.vocabulary;
create trigger vocabulary_set_updated_at
before update on public.vocabulary
for each row execute function public.set_updated_at();

drop trigger if exists writing_history_set_updated_at on public.writing_history;
create trigger writing_history_set_updated_at
before update on public.writing_history
for each row execute function public.set_updated_at();

drop trigger if exists elo_history_set_updated_at on public.elo_history;
create trigger elo_history_set_updated_at
before update on public.elo_history
for each row execute function public.set_updated_at();

drop trigger if exists read_articles_set_updated_at on public.read_articles;
create trigger read_articles_set_updated_at
before update on public.read_articles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.vocabulary enable row level security;
alter table public.writing_history enable row level security;
alter table public.elo_history enable row level security;
alter table public.read_articles enable row level security;

drop policy if exists "profiles_owner_select" on public.profiles;
create policy "profiles_owner_select" on public.profiles
for select using (auth.uid() = user_id);

drop policy if exists "profiles_owner_insert" on public.profiles;
create policy "profiles_owner_insert" on public.profiles
for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update" on public.profiles
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "vocabulary_owner_all" on public.vocabulary;
create policy "vocabulary_owner_all" on public.vocabulary
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "writing_history_owner_all" on public.writing_history;
create policy "writing_history_owner_all" on public.writing_history
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "elo_history_owner_all" on public.elo_history;
create policy "elo_history_owner_all" on public.elo_history
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read_articles_owner_all" on public.read_articles;
create policy "read_articles_owner_all" on public.read_articles
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.apply_battle_settlement(
  p_mode text,
  p_elo_after integer,
  p_elo_change integer,
  p_streak_count integer,
  p_max_elo integer,
  p_coins integer default null,
  p_inventory jsonb default null,
  p_owned_themes text[] default null,
  p_active_theme text default null,
  p_source text default 'battle'
)
returns public.profiles
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_last_practice timestamptz := timezone('utc', now());
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.profiles (
    user_id,
    translation_elo,
    listening_elo,
    streak_count,
    listening_streak,
    max_translation_elo,
    max_listening_elo,
    coins,
    inventory,
    owned_themes,
    active_theme,
    last_practice_at
  )
  values (
    v_user_id,
    case when p_mode = 'translation' then p_elo_after else 600 end,
    case when p_mode = 'listening' then p_elo_after else 600 end,
    case when p_mode = 'translation' then p_streak_count else 0 end,
    case when p_mode = 'listening' then p_streak_count else 0 end,
    case when p_mode = 'translation' then p_max_elo else 600 end,
    case when p_mode = 'listening' then p_max_elo else 600 end,
    coalesce(p_coins, 0),
    coalesce(p_inventory, '{"capsule": 15, "hint_ticket": 3, "vocab_ticket": 2, "audio_ticket": 2, "refresh_ticket": 2}'::jsonb),
    coalesce(p_owned_themes, array['morning_coffee']),
    coalesce(p_active_theme, 'morning_coffee'),
    v_last_practice
  )
  on conflict (user_id) do update
  set
    translation_elo = case when p_mode = 'translation' then p_elo_after else public.profiles.translation_elo end,
    listening_elo = case when p_mode = 'listening' then p_elo_after else public.profiles.listening_elo end,
    streak_count = case when p_mode = 'translation' then p_streak_count else public.profiles.streak_count end,
    listening_streak = case when p_mode = 'listening' then p_streak_count else public.profiles.listening_streak end,
    max_translation_elo = case when p_mode = 'translation' then greatest(public.profiles.max_translation_elo, p_max_elo) else public.profiles.max_translation_elo end,
    max_listening_elo = case when p_mode = 'listening' then greatest(public.profiles.max_listening_elo, p_max_elo) else public.profiles.max_listening_elo end,
    coins = coalesce(p_coins, public.profiles.coins),
    inventory = coalesce(p_inventory, public.profiles.inventory),
    owned_themes = coalesce(p_owned_themes, public.profiles.owned_themes),
    active_theme = coalesce(p_active_theme, public.profiles.active_theme),
    last_practice_at = v_last_practice,
    updated_at = timezone('utc', now())
  returning * into v_profile;

  insert into public.elo_history (
    user_id,
    mode,
    elo,
    change,
    source,
    timestamp_ms
  )
  values (
    v_user_id,
    p_mode,
    p_elo_after,
    p_elo_change,
    coalesce(p_source, 'battle'),
    (extract(epoch from v_last_practice) * 1000)::bigint
  );

  return v_profile;
end;
$$;

grant execute on function public.apply_battle_settlement(text, integer, integer, integer, integer, integer, jsonb, text[], text, text) to authenticated;
