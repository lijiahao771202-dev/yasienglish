alter table public.vocabulary
  add column if not exists lapses integer not null default 0,
  add column if not exists learning_steps integer not null default 0,
  add column if not exists archived_at_ms bigint;

update public.vocabulary
set
  lapses = coalesce(lapses, 0),
  learning_steps = coalesce(learning_steps, 0)
where lapses is null
   or learning_steps is null;
