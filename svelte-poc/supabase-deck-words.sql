-- `deck_words` — one row per vocab card (see src/lib/server/data.ts). Run in the
-- Supabase SQL editor. Safe to re-run: table/policy creation is guarded, and the only
-- statement that touches an already-existing table is the `lang` column addition below.

create table if not exists deck_words (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  h              text not null,
  p              text not null,
  m              text not null,
  pool           boolean not null default false,
  due            timestamptz not null,
  stability      double precision not null default 0,
  difficulty     double precision not null default 0,
  elapsed_days   integer not null default 0,
  scheduled_days integer not null default 0,
  learning_steps integer not null default 0,
  reps           integer not null default 0,
  lapses         integer not null default 0,
  state          integer not null default 0,
  last_review    timestamptz,
  created_at     timestamptz not null default now()
);

alter table deck_words enable row level security;

drop policy if exists "deck_words self" on deck_words;
create policy "deck_words self" on deck_words
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Language of each word ('zh' or 'ja'). Existing rows predate multi-language support and
-- are all Chinese, hence the 'zh' default.
alter table deck_words add column if not exists lang text not null default 'zh';

create index if not exists deck_words_user_lang_idx on deck_words(user_id, lang);

-- Widen the identity constraint to include lang, so the same (h, m) can exist once per
-- language (e.g. 出口 as both a Chinese and a Japanese word). Safe on existing data: any
-- rows unique under (user_id, h, m) are still unique under the superset (user_id, h, m,
-- lang). `deck_words_user_id_h_m_key` is Postgres's default name for the constraint the
-- `create table` above would have produced; if the live table's was created/named
-- differently, this drop is a silent no-op and the add below will fail with a duplicate
-- constraint error — in that case, find the real name via `\d deck_words` and drop it first.
alter table deck_words drop constraint if exists deck_words_user_id_h_m_key;
alter table deck_words add constraint deck_words_user_id_h_m_lang_key unique (user_id, h, m, lang);
