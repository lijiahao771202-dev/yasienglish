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
    select coalesce(sum(greatest(l.delta, 0)), 0)
    into v_today_gain
    from public.reading_coin_ledger as l
    where l.user_id = v_user_id
      and l.scene = coalesce(nullif(p_scene, ''), 'read')
      and l.created_at >= date_trunc('day', timezone('utc', now()));

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
