alter table public.vocabulary
  add column if not exists word_breakdown text[],
  add column if not exists morphology_notes text[];

update public.vocabulary
set
  word_breakdown = coalesce(word_breakdown, array[]::text[]),
  morphology_notes = coalesce(morphology_notes, array[]::text[])
where
  word_breakdown is null
  or morphology_notes is null;

alter table public.vocabulary
  alter column word_breakdown set default array[]::text[],
  alter column morphology_notes set default array[]::text[];
