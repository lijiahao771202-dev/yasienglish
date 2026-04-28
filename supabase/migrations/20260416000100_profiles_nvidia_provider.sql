alter table public.profiles
  add column if not exists nvidia_api_key text not null default '';

alter table public.profiles
  add column if not exists nvidia_model text not null default 'z-ai/glm5';

update public.profiles
set nvidia_api_key = ''
where nvidia_api_key is null;

update public.profiles
set nvidia_model = 'z-ai/glm5'
where nvidia_model is null or nvidia_model = '';
