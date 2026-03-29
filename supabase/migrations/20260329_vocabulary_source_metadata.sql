alter table public.vocabulary
  add column if not exists source_kind text,
  add column if not exists source_label text,
  add column if not exists source_sentence text,
  add column if not exists source_note text;

update public.vocabulary
set
  source_kind = coalesce(nullif(source_kind, ''), 'legacy_local'),
  source_label = coalesce(nullif(source_label, ''), '本地旧卡片'),
  source_sentence = case
    when coalesce(nullif(source_sentence, ''), '') <> '' then source_sentence
    when coalesce(nullif(context, ''), '') <> '' then context
    else ''
  end,
  source_note = coalesce(source_note, '')
where
  source_kind is null
  or source_kind = ''
  or source_label is null
  or source_label = ''
  or source_sentence is null
  or source_note is null;

alter table public.vocabulary
  alter column source_kind set default 'legacy_local',
  alter column source_label set default '本地旧卡片',
  alter column source_sentence set default '',
  alter column source_note set default '';
