alter table public.profiles
  add column if not exists deepseek_api_key text not null default '';

update public.profiles
set deepseek_api_key = ''
where deepseek_api_key is null;
