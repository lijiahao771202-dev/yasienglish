alter table public.profiles
  add column if not exists github_api_key text not null default '';

alter table public.profiles
  add column if not exists github_model text not null default 'gpt-4o';

update public.profiles
set github_api_key = ''
where github_api_key is null;

update public.profiles
set github_model = 'gpt-4o'
where github_model is null or github_model = '';
