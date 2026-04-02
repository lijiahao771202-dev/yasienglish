alter table public.read_articles
  add column if not exists article_key text,
  add column if not exists article_title text,
  add column if not exists article_payload jsonb,
  add column if not exists reading_notes_payload jsonb,
  add column if not exists grammar_payload jsonb,
  add column if not exists ask_payload jsonb;

create index if not exists read_articles_user_article_key_idx on public.read_articles (user_id, article_key);
