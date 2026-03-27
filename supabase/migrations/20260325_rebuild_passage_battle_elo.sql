alter table public.profiles
  add column if not exists rebuild_elo integer not null default 400,
  add column if not exists rebuild_streak integer not null default 0,
  add column if not exists rebuild_max_elo integer not null default 400;

update public.profiles
set
  rebuild_elo = coalesce(rebuild_elo, rebuild_hidden_elo, listening_elo, 400),
  rebuild_streak = coalesce(rebuild_streak, 0),
  rebuild_max_elo = greatest(
    coalesce(rebuild_max_elo, 0),
    coalesce(rebuild_elo, rebuild_hidden_elo, listening_elo, 400)
  );

alter table public.elo_history
  drop constraint if exists elo_history_mode_check;

alter table public.elo_history
  add constraint elo_history_mode_check
  check (mode in ('translation', 'listening', 'rebuild'));

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
    rebuild_elo,
    rebuild_hidden_elo,
    streak_count,
    listening_streak,
    rebuild_streak,
    max_translation_elo,
    max_listening_elo,
    rebuild_max_elo,
    coins,
    inventory,
    owned_themes,
    active_theme,
    last_practice_at
  )
  values (
    v_user_id,
    case when p_mode = 'translation' then p_elo_after else 400 end,
    case when p_mode = 'listening' then p_elo_after else 400 end,
    case when p_mode = 'rebuild' then p_elo_after else 400 end,
    400,
    case when p_mode = 'translation' then p_streak_count else 0 end,
    case when p_mode = 'listening' then p_streak_count else 0 end,
    case when p_mode = 'rebuild' then p_streak_count else 0 end,
    case when p_mode = 'translation' then p_max_elo else 400 end,
    case when p_mode = 'listening' then p_max_elo else 400 end,
    case when p_mode = 'rebuild' then p_max_elo else 400 end,
    coalesce(p_coins, 500),
    coalesce(p_inventory, '{"capsule": 10, "hint_ticket": 10, "vocab_ticket": 10, "audio_ticket": 10, "refresh_ticket": 10}'::jsonb),
    coalesce(p_owned_themes, array['morning_coffee']),
    coalesce(p_active_theme, 'morning_coffee'),
    v_last_practice
  )
  on conflict (user_id) do update
  set
    translation_elo = case when p_mode = 'translation' then p_elo_after else public.profiles.translation_elo end,
    listening_elo = case when p_mode = 'listening' then p_elo_after else public.profiles.listening_elo end,
    rebuild_elo = case when p_mode = 'rebuild' then p_elo_after else public.profiles.rebuild_elo end,
    streak_count = case when p_mode = 'translation' then p_streak_count else public.profiles.streak_count end,
    listening_streak = case when p_mode = 'listening' then p_streak_count else public.profiles.listening_streak end,
    rebuild_streak = case when p_mode = 'rebuild' then p_streak_count else public.profiles.rebuild_streak end,
    max_translation_elo = case when p_mode = 'translation' then greatest(public.profiles.max_translation_elo, p_max_elo) else public.profiles.max_translation_elo end,
    max_listening_elo = case when p_mode = 'listening' then greatest(public.profiles.max_listening_elo, p_max_elo) else public.profiles.max_listening_elo end,
    rebuild_max_elo = case when p_mode = 'rebuild' then greatest(public.profiles.rebuild_max_elo, p_max_elo) else public.profiles.rebuild_max_elo end,
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
