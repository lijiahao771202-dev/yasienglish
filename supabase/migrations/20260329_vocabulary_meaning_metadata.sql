alter table public.vocabulary
  add column if not exists phonetic text,
  add column if not exists meaning_groups jsonb,
  add column if not exists highlighted_meanings text[];

update public.vocabulary
set
  phonetic = coalesce(phonetic, ''),
  meaning_groups = coalesce(meaning_groups, '[]'::jsonb),
  highlighted_meanings = coalesce(highlighted_meanings, array[]::text[])
where
  phonetic is null
  or meaning_groups is null
  or highlighted_meanings is null;

alter table public.vocabulary
  alter column phonetic set default '',
  alter column meaning_groups set default '[]'::jsonb,
  alter column highlighted_meanings set default array[]::text[];
