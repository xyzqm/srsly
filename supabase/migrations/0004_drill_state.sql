-- 0004 — writing_state becomes drill_state
--
-- Handwriting got its own column in 0003. A second drill (Spanish conjugation) has exactly the
-- same shape: per-item FSRS state that is not a deck word, merged by whole-card ownership,
-- feeding no streak and no budget. Giving it a second column would mean a second migration, a
-- second merge and a second entry in all three of the places lib/storage/supabase.ts demands —
-- and a third drill would mean a third of each.
--
-- So the column is renamed and the KEYS carry the drill: "w:好" for handwriting, "c:hablar:pres"
-- for conjugation. A new drill is now a prefix.
--
-- RENAMED, NOT REPLACED. Handwriting progress already exists in production; dropping and
-- recreating would silently delete it. The rename preserves every row.
--
-- The keys inside are NOT rewritten here, and deliberately. Every key written before this
-- migration is a bare Han character, and `parseDrillKey` reads an unprefixed key as
-- handwriting — so the old data is already correct under the new scheme and is rewritten with
-- its prefix the next time that character is practised. Doing it in SQL would also only fix
-- the cloud, leaving every device's localStorage to be migrated in TypeScript anyway.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_data' and column_name = 'writing_state'
  ) then
    alter table public.user_data rename column writing_state to drill_state;
  end if;
end $$;

-- For a database built from schema.sql after the rename, or one that never had 0003.
alter table public.user_data add column if not exists drill_state jsonb;
