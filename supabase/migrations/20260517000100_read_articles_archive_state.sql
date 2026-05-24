alter table public.read_articles
  add column if not exists archived_at_ms bigint;

create index if not exists read_articles_user_archived_idx
  on public.read_articles (user_id, archived_at_ms desc nulls last);
