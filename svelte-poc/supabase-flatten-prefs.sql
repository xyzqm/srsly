-- Flattens `poc_user_data.prefs` (a jsonb blob: { theme, hskLevel, showWordBoundaries, language })
-- into individual columns — see src/lib/server/data.ts (loadPrefs/savePrefs). Direct column
-- reads/writes instead of a jsonb round trip for every single-setting save. Run in the Supabase
-- SQL editor.

alter table poc_user_data add column if not exists theme text not null default 'paper';
alter table poc_user_data add column if not exists hsk_level int not null default 3;
alter table poc_user_data add column if not exists show_word_boundaries boolean not null default true;
alter table poc_user_data add column if not exists language text not null default 'zh';
alter table poc_user_data add column if not exists words_per_passage int not null default 8;

-- Backfill from the existing jsonb blob before dropping it.
update poc_user_data set
  theme = coalesce(prefs->>'theme', 'paper'),
  hsk_level = coalesce((prefs->>'hskLevel')::int, 3),
  show_word_boundaries = coalesce((prefs->>'showWordBoundaries')::boolean, true),
  language = coalesce(prefs->>'language', 'zh')
where prefs is not null and prefs != '{}'::jsonb;

alter table poc_user_data drop column if exists prefs;
