alter table public.vocabulary
  add column if not exists phonetic text,
  add column if not exists meaning_groups jsonb,
  add column if not exists highlighted_meanings text[],
  add column if not exists word_breakdown text[],
  add column if not exists morphology_notes text[],
  add column if not exists source_kind text,
  add column if not exists source_label text,
  add column if not exists source_sentence text,
  add column if not exists source_note text;

update public.vocabulary
set
  phonetic = coalesce(phonetic, ''),
  meaning_groups = coalesce(meaning_groups, '[]'::jsonb),
  highlighted_meanings = coalesce(highlighted_meanings, array[]::text[]),
  word_breakdown = coalesce(word_breakdown, array[]::text[]),
  morphology_notes = coalesce(morphology_notes, array[]::text[]),
  source_kind = coalesce(nullif(source_kind, ''), 'legacy_local'),
  source_label = coalesce(nullif(source_label, ''), '本地旧卡片'),
  source_sentence = case
    when coalesce(nullif(source_sentence, ''), '') <> '' then source_sentence
    when coalesce(nullif(context, ''), '') <> '' then context
    else ''
  end,
  source_note = coalesce(source_note, '')
where
  phonetic is null
  or meaning_groups is null
  or highlighted_meanings is null
  or word_breakdown is null
  or morphology_notes is null
  or source_kind is null
  or source_kind = ''
  or source_label is null
  or source_label = ''
  or source_sentence is null
  or source_note is null;

alter table public.vocabulary
  alter column phonetic set default '',
  alter column meaning_groups set default '[]'::jsonb,
  alter column highlighted_meanings set default array[]::text[],
  alter column word_breakdown set default array[]::text[],
  alter column morphology_notes set default array[]::text[],
  alter column source_kind set default 'legacy_local',
  alter column source_label set default '本地旧卡片',
  alter column source_sentence set default '',
  alter column source_note set default '';

notify pgrst, 'reload schema';
