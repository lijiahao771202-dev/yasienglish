create table if not exists public.error_ledger (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) not null,
    text text not null,
    tag text,
    created_at bigint default extract(epoch from now()) * 1000,
    updated_at timestamptz default now()
);

alter table public.error_ledger enable row level security;

drop policy if exists "Users can read own error ledger" on public.error_ledger;
create policy "Users can read own error ledger"
    on public.error_ledger for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can insert own error ledger" on public.error_ledger;
create policy "Users can insert own error ledger"
    on public.error_ledger for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can update own error ledger" on public.error_ledger;
create policy "Users can update own error ledger"
    on public.error_ledger for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete own error ledger" on public.error_ledger;
create policy "Users can delete own error ledger"
    on public.error_ledger for delete
    to authenticated
    using (auth.uid() = user_id);
