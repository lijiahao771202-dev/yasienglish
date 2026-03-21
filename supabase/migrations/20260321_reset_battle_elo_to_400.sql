alter table public.profiles
  alter column translation_elo set default 400,
  alter column listening_elo set default 400,
  alter column max_translation_elo set default 400,
  alter column max_listening_elo set default 400;

update public.profiles
set
  translation_elo = 400,
  listening_elo = 400,
  max_translation_elo = 400,
  max_listening_elo = 400,
  updated_at = timezone('utc', now());

delete from public.elo_history;
