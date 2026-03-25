alter table public.profiles
  add column if not exists rebuild_hidden_elo integer not null default 400;

update public.profiles
set rebuild_hidden_elo = coalesce(rebuild_hidden_elo, listening_elo, 400)
where rebuild_hidden_elo is null;
