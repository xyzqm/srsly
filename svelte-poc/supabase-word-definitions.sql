-- `word_definitions` — shared, cross-user cache of reading+meaning for words that our own
-- bundled dictionaries (CC-CEDICT/HSK for zh, JMdict/JLPT for ja) don't cover — mainly proper
-- nouns invented by the passage generator. See src/lib/server/definitions.ts (getDefinition).
-- Run in the Supabase SQL editor.
--
-- No user_id: a word's definition doesn't depend on which user's passage produced it, so this
-- is a global cache, not per-user data — conceptually the same role as the static cedict.json/
-- HSK_VOCAB dictionaries, just persisted and grown incrementally instead of static.

create table if not exists word_definitions (
  word       text not null,
  lang       text not null,
  reading    text not null default '',
  meaning    text not null default '',
  created_at timestamptz not null default now(),
  primary key (word, lang)
);

alter table word_definitions enable row level security;
-- No policies: only the secret-key client (src/lib/server/definitions.ts, which bypasses RLS
-- entirely) ever touches this table. Deliberately no "authenticated"/"anon" access.

-- If you already ran an earlier version of this file that created a scoped `definitions_writer`
-- role/policy, clean it up (getDefinition now uses the Supabase secret key instead):
--   drop policy if exists "word_definitions writer" on word_definitions;
--   revoke all on public.word_definitions from definitions_writer;
--   revoke definitions_writer from authenticator;
--   drop role if exists definitions_writer;
