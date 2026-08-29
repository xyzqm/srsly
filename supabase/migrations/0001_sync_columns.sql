-- Columns lib/storage/supabase.ts reads and writes that the original user_data table lacked.
--
-- WHY THIS FILE EXISTS. These statements lived only as prose in a comment at the top of
-- lib/storage/supabase.ts. A migration written in a comment is a migration nobody has run:
-- the live project had them applied by hand, supabase/schema.sql never learned about them,
-- and any database built from the repo silently stored nothing. Real files, run in order.
--
-- Safe to run repeatedly, and safe on a project already patched by hand.

-- Per-language decks. Without this, saveVocabDeck's upsert fails and EVERY deck write is
-- dropped — the legacy `deck` column is read as a fallback but is never written to.
alter table public.user_data add column if not exists decks jsonb;

-- Finished passages, per language. See lib/shelf.ts.
alter table public.user_data add column if not exists shelf jsonb;

-- Cloze blank progress for today's passages. Pruned to the current date on every write.
alter table public.user_data add column if not exists passage_state jsonb;

-- The review heatmap's record of what was studied on each past day. Merged per-day MAX
-- rather than summed, so a round trip between two devices cannot inflate it.
alter table public.user_data add column if not exists activity_log jsonb;

-- Finished lesson ids. Merged as a union.
alter table public.user_data add column if not exists lessons_done jsonb;
