alter table public.profiles
  add column if not exists exam_date text default null,
  add column if not exists exam_type text default null,
  add column if not exists exam_goal_score real default null;
