alter table public.profiles
  add column if not exists reading_coins integer not null default 40,
  add column if not exists reading_streak integer not null default 0,
  add column if not exists reading_last_daily_grant_at timestamptz null,
  add column if not exists cat_score integer not null default 1000,
  add column if not exists cat_level integer not null default 1,
  add column if not exists cat_theta double precision not null default 0,
  add column if not exists cat_points integer not null default 0,
  add column if not exists cat_current_band integer not null default 3,
  add column if not exists cat_updated_at timestamptz not null default timezone('utc', now());

update public.profiles
set
  reading_coins = coalesce(reading_coins, 40),
  reading_streak = coalesce(reading_streak, 0),
  cat_score = coalesce(cat_score, 1000),
  cat_level = coalesce(cat_level, 1),
  cat_theta = coalesce(cat_theta, 0),
  cat_points = coalesce(cat_points, 0),
  cat_current_band = coalesce(cat_current_band, 3),
  cat_updated_at = coalesce(cat_updated_at, timezone('utc', now()));

create table if not exists public.cat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text,
  difficulty text not null check (difficulty in ('cet4', 'cet6', 'ielts')),
  band integer not null default 3,
  score_before integer not null default 1000,
  score_after integer,
  level_after integer,
  theta_after double precision,
  accuracy double precision,
  speed_score double precision,
  stability_score double precision,
  performance double precision,
  delta integer,
  points_delta integer,
  next_band integer,
  quiz_correct integer,
  quiz_total integer,
  reading_ms bigint,
  status text not null default 'started' check (status in ('started', 'completed')),
  article_title text,
  article_url text,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists cat_sessions_user_created_idx on public.cat_sessions (user_id, created_at desc);
create index if not exists cat_sessions_user_status_idx on public.cat_sessions (user_id, status, created_at desc);

drop trigger if exists cat_sessions_set_updated_at on public.cat_sessions;
create trigger cat_sessions_set_updated_at
before update on public.cat_sessions
for each row execute function public.set_updated_at();

alter table public.cat_sessions enable row level security;

drop policy if exists "cat_sessions_owner_all" on public.cat_sessions;
create policy "cat_sessions_owner_all" on public.cat_sessions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.user_cat_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null,
  source text not null default 'cat_session',
  meta jsonb not null default '{}'::jsonb,
  awarded_at timestamptz not null default timezone('utc', now()),
  unique (user_id, badge_key)
);

create index if not exists user_cat_badges_user_awarded_idx on public.user_cat_badges (user_id, awarded_at desc);

alter table public.user_cat_badges enable row level security;

drop policy if exists "user_cat_badges_owner_select" on public.user_cat_badges;
create policy "user_cat_badges_owner_select" on public.user_cat_badges
for select using (auth.uid() = user_id);

drop policy if exists "user_cat_badges_owner_insert" on public.user_cat_badges;
create policy "user_cat_badges_owner_insert" on public.user_cat_badges
for insert with check (auth.uid() = user_id);

create table if not exists public.reading_coin_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scene text not null default 'read',
  action text not null,
  delta integer not null,
  dedupe_key text,
  balance_after integer not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists reading_coin_ledger_user_dedupe_idx
  on public.reading_coin_ledger (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists reading_coin_ledger_user_created_idx
  on public.reading_coin_ledger (user_id, created_at desc);

alter table public.reading_coin_ledger enable row level security;

drop policy if exists "reading_coin_ledger_owner_select" on public.reading_coin_ledger;
create policy "reading_coin_ledger_owner_select" on public.reading_coin_ledger
for select using (auth.uid() = user_id);

drop policy if exists "reading_coin_ledger_owner_insert" on public.reading_coin_ledger;
create policy "reading_coin_ledger_owner_insert" on public.reading_coin_ledger
for insert with check (auth.uid() = user_id);

alter table public.user_messages
  add column if not exists reward_reading_coins integer not null default 0,
  add column if not exists reward_cat_points integer not null default 0,
  add column if not exists reward_cat_badges jsonb not null default '[]'::jsonb;

create or replace function public.apply_reading_coin_event(
  p_action text,
  p_delta integer,
  p_scene text default 'read',
  p_dedupe_key text default null,
  p_meta jsonb default '{}'::jsonb,
  p_fail_if_insufficient boolean default false,
  p_daily_gain_cap integer default null
)
returns table(
  ledger_id uuid,
  applied boolean,
  insufficient boolean,
  balance_after integer,
  delta integer,
  action text,
  dedupe_key text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_existing_ledger public.reading_coin_ledger;
  v_current_balance integer := 0;
  v_next_balance integer := 0;
  v_effective_delta integer := p_delta;
  v_actual_delta integer := 0;
  v_today_gain integer := 0;
  v_last_grant_date date;
  v_today date := (timezone('utc', now()))::date;
  v_next_streak integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_action is null or btrim(p_action) = '' then
    raise exception 'Action is required';
  end if;

  insert into public.profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_profile
  from public.profiles
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  v_current_balance := coalesce(v_profile.reading_coins, 40);

  if p_dedupe_key is not null and btrim(p_dedupe_key) <> '' then
    select *
    into v_existing_ledger
    from public.reading_coin_ledger as l
    where l.user_id = v_user_id
      and l.dedupe_key = p_dedupe_key
    limit 1;

    if found then
      return query
      select
        v_existing_ledger.id,
        false,
        false,
        v_current_balance,
        0,
        p_action,
        p_dedupe_key;
      return;
    end if;
  end if;

  if p_daily_gain_cap is not null and p_daily_gain_cap >= 0 and v_effective_delta > 0 then
    select coalesce(sum(greatest(delta, 0)), 0)
    into v_today_gain
    from public.reading_coin_ledger
    where user_id = v_user_id
      and scene = coalesce(nullif(p_scene, ''), 'read')
      and created_at >= date_trunc('day', timezone('utc', now()));

    if v_today_gain >= p_daily_gain_cap then
      v_effective_delta := 0;
    else
      v_effective_delta := least(v_effective_delta, p_daily_gain_cap - v_today_gain);
    end if;
  end if;

  if p_fail_if_insufficient and v_current_balance + v_effective_delta < 0 then
    return query
    select
      null::uuid,
      false,
      true,
      v_current_balance,
      0,
      p_action,
      p_dedupe_key;
    return;
  end if;

  v_next_balance := greatest(0, v_current_balance + v_effective_delta);
  v_actual_delta := v_next_balance - v_current_balance;

  v_last_grant_date := case
    when v_profile.reading_last_daily_grant_at is null then null
    else (v_profile.reading_last_daily_grant_at at time zone 'utc')::date
  end;

  if v_actual_delta > 0 and p_action in ('daily_login', 'read_complete', 'quiz_complete', 'reading_streak') then
    if v_last_grant_date is null then
      v_next_streak := 1;
    elsif v_last_grant_date = v_today then
      v_next_streak := coalesce(v_profile.reading_streak, 0);
    elsif v_last_grant_date = (v_today - 1) then
      v_next_streak := coalesce(v_profile.reading_streak, 0) + 1;
    else
      v_next_streak := 1;
    end if;
  else
    v_next_streak := coalesce(v_profile.reading_streak, 0);
  end if;

  update public.profiles
  set
    reading_coins = v_next_balance,
    reading_streak = v_next_streak,
    reading_last_daily_grant_at = case
      when v_actual_delta > 0 and p_action in ('daily_login', 'read_complete', 'quiz_complete', 'reading_streak')
        then timezone('utc', now())
      else reading_last_daily_grant_at
    end,
    updated_at = timezone('utc', now())
  where user_id = v_user_id;

  insert into public.reading_coin_ledger (
    user_id,
    scene,
    action,
    delta,
    dedupe_key,
    balance_after,
    meta
  )
  values (
    v_user_id,
    coalesce(nullif(p_scene, ''), 'read'),
    p_action,
    v_actual_delta,
    nullif(p_dedupe_key, ''),
    v_next_balance,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning * into v_existing_ledger;

  return query
  select
    v_existing_ledger.id,
    v_actual_delta <> 0,
    false,
    v_next_balance,
    v_actual_delta,
    p_action,
    p_dedupe_key;
end;
$$;

grant execute on function public.apply_reading_coin_event(text, integer, text, text, jsonb, boolean, integer) to authenticated;

create or replace function public.start_cat_session(
  p_topic text,
  p_difficulty text,
  p_band integer,
  p_article_title text,
  p_article_url text
)
returns table(
  session_id uuid,
  score_before integer,
  level_before integer,
  theta_before double precision,
  band integer,
  difficulty text,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_session public.cat_sessions;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_profile
  from public.profiles
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  insert into public.cat_sessions (
    user_id,
    topic,
    difficulty,
    band,
    score_before,
    article_title,
    article_url,
    status
  )
  values (
    v_user_id,
    nullif(p_topic, ''),
    case when p_difficulty in ('cet4', 'cet6', 'ielts') then p_difficulty else 'cet4' end,
    greatest(1, coalesce(p_band, coalesce(v_profile.cat_current_band, 3))),
    coalesce(v_profile.cat_score, 1000),
    nullif(p_article_title, ''),
    nullif(p_article_url, ''),
    'started'
  )
  returning * into v_session;

  return query
  select
    v_session.id,
    coalesce(v_profile.cat_score, 1000),
    coalesce(v_profile.cat_level, 1),
    coalesce(v_profile.cat_theta, 0),
    v_session.band,
    v_session.difficulty,
    v_session.created_at;
end;
$$;

grant execute on function public.start_cat_session(text, text, integer, text, text) to authenticated;

create or replace function public.submit_cat_session(
  p_session_id uuid,
  p_accuracy double precision,
  p_speed_score double precision,
  p_stability_score double precision,
  p_performance double precision,
  p_delta integer,
  p_points_delta integer,
  p_next_band integer,
  p_quiz_correct integer,
  p_quiz_total integer,
  p_reading_ms bigint,
  p_score_after integer,
  p_level_after integer,
  p_theta_after double precision,
  p_badges text[] default '{}'::text[]
)
returns table(
  session_id uuid,
  cat_score integer,
  cat_level integer,
  cat_theta double precision,
  cat_points integer,
  cat_current_band integer,
  delta integer,
  points_delta integer,
  next_band integer,
  awarded_badges text[]
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.cat_sessions;
  v_profile public.profiles;
  v_awarded text[] := '{}'::text[];
  v_badge text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_session
  from public.cat_sessions
  where id = p_session_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'CAT session not found';
  end if;

  select *
  into v_profile
  from public.profiles
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  update public.profiles
  set
    cat_score = greatest(1, coalesce(p_score_after, coalesce(v_profile.cat_score, 1000))),
    cat_level = greatest(1, coalesce(p_level_after, coalesce(v_profile.cat_level, 1))),
    cat_theta = coalesce(p_theta_after, coalesce(v_profile.cat_theta, 0)),
    cat_points = greatest(0, coalesce(v_profile.cat_points, 0) + greatest(0, coalesce(p_points_delta, 0))),
    cat_current_band = greatest(1, least(9, coalesce(p_next_band, coalesce(v_profile.cat_current_band, 3)))),
    cat_updated_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where user_id = v_user_id
  returning * into v_profile;

  update public.cat_sessions
  set
    accuracy = greatest(0, least(1, coalesce(p_accuracy, 0))),
    speed_score = greatest(0, least(1, coalesce(p_speed_score, 0))),
    stability_score = greatest(0, least(1, coalesce(p_stability_score, 0))),
    performance = greatest(0, least(1, coalesce(p_performance, 0))),
    delta = coalesce(p_delta, 0),
    points_delta = greatest(0, coalesce(p_points_delta, 0)),
    score_after = v_profile.cat_score,
    level_after = v_profile.cat_level,
    theta_after = v_profile.cat_theta,
    next_band = v_profile.cat_current_band,
    quiz_correct = greatest(0, coalesce(p_quiz_correct, 0)),
    quiz_total = greatest(0, coalesce(p_quiz_total, 0)),
    reading_ms = greatest(0, coalesce(p_reading_ms, 0)),
    status = 'completed',
    completed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_session.id
  returning * into v_session;

  if p_badges is not null then
    foreach v_badge in array p_badges
    loop
      if v_badge is null or btrim(v_badge) = '' then
        continue;
      end if;

      insert into public.user_cat_badges (user_id, badge_key, source, meta)
      values (v_user_id, v_badge, 'cat_session', jsonb_build_object('session_id', v_session.id))
      on conflict (user_id, badge_key) do nothing;

      if found then
        v_awarded := array_append(v_awarded, v_badge);
      end if;
    end loop;
  end if;

  return query
  select
    v_session.id,
    v_profile.cat_score,
    v_profile.cat_level,
    v_profile.cat_theta,
    v_profile.cat_points,
    v_profile.cat_current_band,
    coalesce(v_session.delta, 0),
    coalesce(v_session.points_delta, 0),
    coalesce(v_session.next_band, v_profile.cat_current_band),
    v_awarded;
end;
$$;

grant execute on function public.submit_cat_session(uuid, double precision, double precision, double precision, double precision, integer, integer, integer, integer, integer, bigint, integer, integer, double precision, text[]) to authenticated;

create or replace function public.claim_user_message_reward(p_message_id uuid)
returns table(
  message_id uuid,
  claimed_at timestamptz,
  coins integer,
  inventory jsonb,
  reading_coins integer,
  cat_points integer,
  cat_badges jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.user_messages;
  v_profile public.profiles;
  v_delta jsonb;
  v_claimed_at timestamptz := timezone('utc', now());
  v_badges jsonb := '[]'::jsonb;
  v_badge text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_message
  from public.user_messages
  where id = p_message_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Message not found';
  end if;

  if v_message.claimed_at is not null then
    select *
    into v_profile
    from public.profiles
    where user_id = v_user_id;

    return query
    select
      v_message.id,
      v_message.claimed_at,
      coalesce(v_profile.coins, 0),
      coalesce(v_profile.inventory, '{}'::jsonb),
      coalesce(v_profile.reading_coins, 0),
      coalesce(v_profile.cat_points, 0),
      coalesce(v_message.reward_cat_badges, '[]'::jsonb);
    return;
  end if;

  select *
  into v_profile
  from public.profiles
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  v_delta := coalesce(v_message.reward_inventory, '{}'::jsonb);
  v_badges := coalesce(v_message.reward_cat_badges, '[]'::jsonb);

  update public.profiles as p
  set
    coins = greatest(0, coalesce(p.coins, 0) + coalesce(v_message.reward_coins, 0)),
    reading_coins = greatest(0, coalesce(p.reading_coins, 0) + coalesce(v_message.reward_reading_coins, 0)),
    cat_points = greatest(0, coalesce(p.cat_points, 0) + coalesce(v_message.reward_cat_points, 0)),
    cat_updated_at = case
      when coalesce(v_message.reward_cat_points, 0) <> 0 then timezone('utc', now())
      else p.cat_updated_at
    end,
    inventory = coalesce(p.inventory, '{}'::jsonb) || jsonb_build_object(
      'capsule', greatest(0, coalesce((p.inventory->>'capsule')::integer, 0) + coalesce((v_delta->>'capsule')::integer, 0)),
      'hint_ticket', greatest(0, coalesce((p.inventory->>'hint_ticket')::integer, 0) + coalesce((v_delta->>'hint_ticket')::integer, 0)),
      'vocab_ticket', greatest(0, coalesce((p.inventory->>'vocab_ticket')::integer, 0) + coalesce((v_delta->>'vocab_ticket')::integer, 0)),
      'audio_ticket', greatest(0, coalesce((p.inventory->>'audio_ticket')::integer, 0) + coalesce((v_delta->>'audio_ticket')::integer, 0)),
      'refresh_ticket', greatest(0, coalesce((p.inventory->>'refresh_ticket')::integer, 0) + coalesce((v_delta->>'refresh_ticket')::integer, 0))
    ),
    updated_at = timezone('utc', now())
  where p.user_id = v_user_id
  returning p.* into v_profile;

  if jsonb_typeof(v_badges) = 'array' then
    for v_badge in
      select value
      from jsonb_array_elements_text(v_badges)
    loop
      insert into public.user_cat_badges (user_id, badge_key, source, meta)
      values (v_user_id, v_badge, 'mail_reward', jsonb_build_object('message_id', v_message.id))
      on conflict (user_id, badge_key) do nothing;
    end loop;
  end if;

  update public.user_messages
  set
    claimed_at = v_claimed_at,
    is_read = true
  where id = p_message_id
  returning * into v_message;

  return query
  select
    v_message.id,
    v_message.claimed_at,
    coalesce(v_profile.coins, 0),
    coalesce(v_profile.inventory, '{}'::jsonb),
    coalesce(v_profile.reading_coins, 0),
    coalesce(v_profile.cat_points, 0),
    coalesce(v_message.reward_cat_badges, '[]'::jsonb);
end;
$$;

grant execute on function public.claim_user_message_reward(uuid) to authenticated;
