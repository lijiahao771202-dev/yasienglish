alter table public.profiles
  add column if not exists deepseek_model text not null default 'deepseek-v4-flash',
  add column if not exists deepseek_thinking_mode text not null default 'off',
  add column if not exists deepseek_reasoning_effort text not null default 'high';

update public.profiles
set deepseek_model = 'deepseek-v4-flash'
where deepseek_model is null or deepseek_model = '';

update public.profiles
set deepseek_thinking_mode = 'off'
where deepseek_thinking_mode is null or deepseek_thinking_mode = '';

update public.profiles
set deepseek_reasoning_effort = 'high'
where deepseek_reasoning_effort is null or deepseek_reasoning_effort = '';
