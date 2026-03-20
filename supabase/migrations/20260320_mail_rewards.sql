alter table public.user_messages
  add column if not exists message_type text not null default 'notice',
  add column if not exists reward_coins integer not null default 0,
  add column if not exists reward_inventory jsonb not null default '{}'::jsonb,
  add column if not exists claimed_at timestamptz null;

create index if not exists user_messages_user_unread_idx
  on public.user_messages (user_id, is_read, created_at desc);

create or replace function public.claim_user_message_reward(p_message_id uuid)
returns table(
  message_id uuid,
  claimed_at timestamptz,
  coins integer,
  inventory jsonb
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
    select v_message.id, v_message.claimed_at, coalesce(v_profile.coins, 0), coalesce(v_profile.inventory, '{}'::jsonb);
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

  update public.profiles as p
  set
    coins = greatest(0, coalesce(p.coins, 0) + coalesce(v_message.reward_coins, 0)),
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

  update public.user_messages
  set
    claimed_at = v_claimed_at,
    is_read = true
  where id = p_message_id
  returning * into v_message;

  return query
  select v_message.id, v_message.claimed_at, coalesce(v_profile.coins, 0), coalesce(v_profile.inventory, '{}'::jsonb);
end;
$$;

grant execute on function public.claim_user_message_reward(uuid) to authenticated;
