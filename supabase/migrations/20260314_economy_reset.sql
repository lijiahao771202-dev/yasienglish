alter table public.profiles
  alter column translation_elo set default 400,
  alter column listening_elo set default 400,
  alter column max_translation_elo set default 400,
  alter column max_listening_elo set default 400,
  alter column coins set default 500,
  alter column inventory set default '{"capsule": 10, "hint_ticket": 10, "vocab_ticket": 10, "audio_ticket": 10, "refresh_ticket": 10}'::jsonb,
  alter column owned_themes set default array['morning_coffee'],
  alter column active_theme set default 'morning_coffee';

update public.profiles
set
  translation_elo = 400,
  listening_elo = 400,
  streak_count = 0,
  listening_streak = 0,
  max_translation_elo = 400,
  max_listening_elo = 400,
  coins = 500,
  inventory = '{"capsule": 10, "hint_ticket": 10, "vocab_ticket": 10, "audio_ticket": 10, "refresh_ticket": 10}'::jsonb,
  owned_themes = array['morning_coffee'],
  active_theme = 'morning_coffee',
  updated_at = timezone('utc', now());

delete from public.elo_history;

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
    case when p_mode = 'translation' then p_elo_after else 400 end,
    case when p_mode = 'listening' then p_elo_after else 400 end,
    case when p_mode = 'translation' then p_streak_count else 0 end,
    case when p_mode = 'listening' then p_streak_count else 0 end,
    case when p_mode = 'translation' then p_max_elo else 400 end,
    case when p_mode = 'listening' then p_max_elo else 400 end,
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
    floor(extract(epoch from v_last_practice) * 1000)::bigint
  );

  return v_profile;
end;
$$;
