create table if not exists public.listening_cabin_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null default '',
  source_prompt text not null default '',
  script_mode text not null default 'monologue',
  session_payload jsonb not null,
  last_played_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create index if not exists listening_cabin_sessions_user_updated_idx
  on public.listening_cabin_sessions (user_id, updated_at desc);

drop trigger if exists listening_cabin_sessions_set_updated_at on public.listening_cabin_sessions;
create trigger listening_cabin_sessions_set_updated_at
before update on public.listening_cabin_sessions
for each row execute procedure public.set_updated_at();

alter table public.listening_cabin_sessions enable row level security;

drop policy if exists "listening_cabin_sessions_owner_all" on public.listening_cabin_sessions;
create policy "listening_cabin_sessions_owner_all" on public.listening_cabin_sessions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
