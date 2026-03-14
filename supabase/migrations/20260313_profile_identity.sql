alter table public.profiles
  add column if not exists username text not null default 'Yasi Learner',
  add column if not exists avatar_preset text not null default 'bubble-bear',
  add column if not exists bio text not null default '',
  add column if not exists learning_preferences jsonb not null default '{
    "target_mode": "read",
    "english_level": "B1",
    "daily_goal_minutes": 20,
    "ui_theme_preference": "bubblegum_pop"
  }'::jsonb;

update public.profiles
set
  username = coalesce(nullif(trim(username), ''), 'Yasi Learner'),
  avatar_preset = coalesce(nullif(trim(avatar_preset), ''), 'bubble-bear'),
  bio = coalesce(bio, ''),
  learning_preferences = coalesce(learning_preferences, '{
    "target_mode": "read",
    "english_level": "B1",
    "daily_goal_minutes": 20,
    "ui_theme_preference": "bubblegum_pop"
  }'::jsonb);
