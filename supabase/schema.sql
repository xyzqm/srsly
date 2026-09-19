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
-- NOTE: consume_ai_credit() below is the source of truth for BOTH daily limits — 3 a day for
-- an anonymous visitor, 10 for a signed-in account. Keep the guest number in sync with
-- GUEST_AI_LIMIT in lib/aiBudget.ts (UI mirror only). The reasoning is at the declaration; the
-- short version is that this deployment runs a shared FREE-TIER key so a visitor can try
-- generation without signing up for anything, and a free tier cannot produce a bill.

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
  used    int not null default 0,
  -- The UTC day `used` counts. A row from an earlier day is expired budget, reset on the next
  -- call rather than by a scheduled job — there is nothing to run and nothing to forget to run.
  day     date
);

alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage own select" on public.ai_usage;
create policy "ai_usage own select" on public.ai_usage
  for select using (auth.uid() = user_id);
-- Writes happen only through the SECURITY DEFINER function below, never directly.

-- ── Server-enforced credit consumption ────────────────────────────────────────
-- Called by the paid API routes. BOTH anonymous guests and real accounts are capped, per day;
-- accounts were unlimited until 0008, which was safe only while no server key existed.
-- Atomic via row lock so concurrent calls can't overspend.
create or replace function public.consume_ai_credit()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid           uuid    := auth.uid();
  is_anon       boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  -- THESE TWO NUMBERS ARE THE ENTIRE SPEND CONTROL, AND THEY ARE PER DAY.
  --
  -- The guest limit was ZERO and accounts were UNLIMITED, which was right for the key this
  -- was written against: an ANTHROPIC key with a card behind it, where funding strangers
  -- means an open-ended bill. It now serves a shared FREE-TIER key, so a portfolio visitor
  -- can try generation without signing up for anything. The reasoning changed because the
  -- risk did — a free tier cannot produce a bill, so the worst case is the shared quota
  -- running out and the demo saying so, which degrades rather than costs.
  --
  -- IT IS STILL A SPEED BUMP AND NOT A CAP, which is the part not to forget. The budget is
  -- per ACCOUNT and an anonymous account is minted by clearing site data — so this stops a
  -- casual visitor refreshing forever and stops nobody who means it. What actually bounds the
  -- damage is that a free tier has nothing to drain but itself.
  --
  -- ⚠ IF THE KEY'S PROJECT HAS BILLING ENABLED IT IS NOT A FREE TIER. Google AI Studio keys
  -- on a billing-enabled Cloud project silently use the PAID tier, at which point these
  -- numbers guard real money and the exposure is 3 a day times however many browsers exist.
  guest_limit   int     := 3;
  account_limit int     := 10;
  today         date    := (now() at time zone 'utc')::date;
  lim           int;
  cur           int;
  cur_day       date;
begin
  if uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_session');
  end if;

  -- A REAL ACCOUNT IS NO LONGER UNLIMITED, and that is the hole 0008 closes. This returned
  -- `allowed` unconditionally for anyone signed in, which was safe only because no server key
  -- was set: the moment one is, "sign up and generate forever on the operator's key" is the
  -- whole protection gone, and signing up is free. The guest cap never covered that path.
  lim := case when is_anon then guest_limit else account_limit end;

  insert into public.ai_usage(user_id, used, day) values (uid, 0, today)
    on conflict (user_id) do nothing;

  select used, day into cur, cur_day
    from public.ai_usage where user_id = uid for update;

  -- A row from an earlier day is budget that has expired.
  if cur_day is distinct from today then
    cur := 0;
  end if;

  if cur >= lim then
    -- TWO REASONS, BECAUSE THE TWO NEED DIFFERENT ADVICE. A guest is told to sign in or bring
    -- a key; someone already signed in can only bring a key or come back tomorrow. Handing an
    -- account holder the guest's message tells them to do something they have already done.
    return jsonb_build_object(
      'allowed', false,
      'reason', case when is_anon then 'guest_limit' else 'daily_limit' end,
      'remaining', 0);
  end if;

  -- `cur + 1`, not `used + 1`: on a day rollover `cur` was reset above while `used` still
  -- holds yesterday's total, so incrementing the column would carry expired spend forward.
  update public.ai_usage set used = cur + 1, day = today where user_id = uid;
  return jsonb_build_object('allowed', true, 'remaining', lim - (cur + 1));
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
