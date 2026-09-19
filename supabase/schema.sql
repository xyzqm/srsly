-- srsly Supabase schema — per-user data + server-enforced guest AI budget.
--
-- SETUP (one time):
--   1. Create a Supabase project.
--   2. Run this whole file in the SQL editor.
--   2b. EXISTING projects: also run everything in supabase/migrations/ in filename order.
--       This file only creates the table when it is absent, so a project made before a
--       column was added will not gain it from here.
--   3. Authentication → Providers: enable "Anonymous sign-ins", "Email", and "Google".
--   4. Put the project URL + anon key in .env.local as:
--        NEXT_PUBLIC_SUPABASE_URL=...
--        NEXT_PUBLIC_SUPABASE_ANON_KEY=...
--
-- NOTE: the guest limit is ZERO, and consume_ai_credit() below is the source of truth for it.
-- Keep it in sync with GUEST_AI_LIMIT in lib/aiBudget.ts (UI mirror only). The reasoning is
-- at the declaration; the short version is that srsly does not fund strangers' generations.

-- ── Per-user data (everything synced, as JSONB blobs) ─────────────────────────
--
-- EVERY COLUMN lib/storage/supabase.ts NAMES MUST APPEAR HERE. This table had drifted:
-- `decks`, `shelf` and `passage_state` existed only as `alter table` statements written in a
-- comment at the top of that file, so a database built from this file was missing them. And
-- because saveVocabDeck writes `decks` and never the legacy `deck`, the upsert failed, the
-- missingColumns guard latched, and every deck write was silently dropped — for all four
-- languages, not just the three the comment was about. tests/sync.test.ts now reads this file
-- and asserts it covers UserDataRow, so the two cannot drift apart again.
create table if not exists public.user_data (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  deck          jsonb,   -- legacy single deck (= Chinese); read-only fallback, never written
  decks         jsonb,   -- { zh: DeckWord[], ja: [], es: [], fr: [] }
  prefs         jsonb,
  srs_state     jsonb,
  shelf         jsonb,   -- { zh: ShelfEntry[], ... } — finished passages, per language
  passage_state jsonb,   -- { "${contentKey}|${idx}": ClozeOccurrenceMap } — today's only
  activity_log  jsonb,   -- [{ d, n }] — the review heatmap's record; merged per-day MAX
  review_counts jsonb,   -- { date, by: { deviceId: { n, r } } } — today's budget spend, merged
                         -- per DEVICE: a sum double-counts on replay and a max under-enforces
  lessons_done  jsonb,   -- string[] of finished lesson ids; merged as a union
  drill_state   jsonb,   -- { zh: { "w:好": DrillCard } } — practice that is not the deck.
                         -- Keys are PREFIXED by drill: w = handwriting (per character),
                         -- c = conjugation (per stem-fact). Merged by whole-card ownership.
                         -- Was writing_state; renamed in 0004 so a second drill costs a
                         -- prefix rather than a column. Feeds no due count, streak or budget
  updated_at    timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "user_data own select" on public.user_data;
drop policy if exists "user_data own insert" on public.user_data;
drop policy if exists "user_data own update" on public.user_data;
create policy "user_data own select" on public.user_data
  for select using (auth.uid() = user_id);
create policy "user_data own insert" on public.user_data
  for insert with check (auth.uid() = user_id);
create policy "user_data own update" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Guest AI budget counter ───────────────────────────────────────────────────
create table if not exists public.ai_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used    int not null default 0
);

alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage own select" on public.ai_usage;
create policy "ai_usage own select" on public.ai_usage
  for select using (auth.uid() = user_id);
-- Writes happen only through the SECURITY DEFINER function below, never directly.

-- ── Server-enforced credit consumption ────────────────────────────────────────
-- Called by the paid API routes. Anonymous (guest) users are capped; real accounts
-- are unlimited. Atomic via row lock so concurrent calls can't overspend.
create or replace function public.consume_ai_credit()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid         uuid    := auth.uid();
  is_anon     boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  -- ZERO, AND IT IS A DEFAULT RATHER THAN A REFUSAL. This began at 5 operator-funded
  -- generations per guest, which is a stranger's Anthropic bill left open to the internet:
  -- the budget is per ANONYMOUS SESSION, so clearing site data mints a fresh one, and nothing
  -- here makes that hard to script. Generation is bring-your-own-key everywhere else in this
  -- codebase — about a cent a passage, billed to the learner — and this line was the one
  -- place that quietly contradicted it.
  --
  -- IT CLOSES LESS THAN IT LOOKS LIKE, AND SAYING SO IS THE POINT. Only /api/daily-content
  -- consumes a credit, and only when `generator.operatorPays` — so a learner using their own
  -- key never reaches this number, which is exactly right. /api/missed-review still falls back
  -- to the operator's key with no meter at all. What actually keeps a public deployment from
  -- spending is SRSLY_API_KEY and ANTHROPIC_API_KEY being UNSET there; this is the second lock,
  -- not the first, and it is the one that survives someone setting a key later.
  --
  -- Raise it if you are running your own copy and mean to fund guests.
  guest_limit int     := 0;
  cur         int;
begin
  if uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_session');
  end if;

  -- Real (non-anonymous) accounts: unlimited; still count for analytics.
  if not is_anon then
    insert into public.ai_usage(user_id, used) values (uid, 1)
      on conflict (user_id) do update set used = public.ai_usage.used + 1;
    return jsonb_build_object('allowed', true, 'remaining', null);
  end if;

  -- Anonymous guests: enforce the budget.
  insert into public.ai_usage(user_id, used) values (uid, 0)
    on conflict (user_id) do nothing;
  select used into cur from public.ai_usage where user_id = uid for update;
  if cur >= guest_limit then
    return jsonb_build_object('allowed', false, 'reason', 'guest_limit', 'remaining', 0);
  end if;
  update public.ai_usage set used = used + 1 where user_id = uid;
  return jsonb_build_object('allowed', true, 'remaining', guest_limit - (cur + 1));
end;
$$;

revoke all on function public.consume_ai_credit() from public;
grant execute on function public.consume_ai_credit() to authenticated;
-- And from `anon` explicitly, because `revoke ... from public` does not reach it: Supabase's
-- bootstrap grants EXECUTE on every public-schema function to anon/authenticated/service_role
-- by default, so this is a NAMED grant rather than the PUBLIC one. Anonymous sign-ins are not
-- the `anon` role — they get a real JWT with role `authenticated` and `is_anonymous: true`,
-- which is why the function tests the JWT claim and not the role — so nothing is metered
-- differently. See migrations/0007, and note it was only safe once consumeAiCredit stopped
-- failing open on an error, since a revoked grant IS an error.
revoke execute on function public.consume_ai_credit() from anon;
