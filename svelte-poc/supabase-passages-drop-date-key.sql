-- Drops "today's date" from the passages uniqueness key — see src/lib/server/data.ts
-- (loadPassage/createPassage). There's only ever one current passage per (user, lang), so a
-- passage generated at 11:59pm should still be the one shown at 12:01am, not hidden until a new
-- one is generated for the new date. `date` stays as a plain display column (when it was
-- generated); it's just no longer part of the lookup/uniqueness key. Run in the Supabase SQL editor.

-- If a user happens to have more than one date's row right now (e.g. generated once right before
-- midnight and once right after, both still within the 24h auto-expiry window), keep only the
-- most recent before the tighter constraint below would otherwise reject the duplicate.
delete from passages a using passages b
  where a.user_id = b.user_id and a.lang = b.lang and a.passage_idx = b.passage_idx
    and a.created_at < b.created_at;

alter table passages drop constraint if exists passages_user_id_date_lang_passage_idx_key;
alter table passages add constraint passages_user_id_lang_passage_idx_key unique (user_id, lang, passage_idx);

drop index if exists passages_user_date_idx;
create index if not exists passages_user_lang_idx on passages(user_id, lang);
