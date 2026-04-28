alter table public.profiles
  alter column translation_elo set default 200,
  alter column max_translation_elo set default 200;

update public.profiles
set
  translation_elo = 200,
  max_translation_elo = 200,
  updated_at = timezone('utc', now());
