alter table public.profiles
  drop column if exists deepseek_api_key,
  drop column if exists glm_api_key,
  drop column if exists nvidia_api_key,
  drop column if exists github_api_key,
  drop column if exists mimo_api_key;

alter table public.profiles
  add column if not exists mimo_model text not null default 'mimo-v2.5-pro';

update public.profiles
set mimo_model = 'mimo-v2.5-pro'
where mimo_model is null or mimo_model = '';
