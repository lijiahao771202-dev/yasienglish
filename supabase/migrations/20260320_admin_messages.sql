create table if not exists public.user_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  is_read boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_messages_user_created_idx
  on public.user_messages (user_id, created_at desc);

alter table public.user_messages enable row level security;

drop policy if exists "user_messages_owner_select" on public.user_messages;
create policy "user_messages_owner_select" on public.user_messages
for select using (auth.uid() = user_id);

drop policy if exists "user_messages_owner_update" on public.user_messages;
create policy "user_messages_owner_update" on public.user_messages
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
