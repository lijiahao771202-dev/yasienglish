alter table public.profiles
  add column if not exists ai_provider text not null default 'deepseek';

alter table public.profiles
  add column if not exists glm_api_key text not null default '';

update public.profiles
set ai_provider = 'deepseek'
where ai_provider is null or ai_provider = '';

update public.profiles
set glm_api_key = ''
where glm_api_key is null;
