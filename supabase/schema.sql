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

-- ── Co-op reading pacts ───────────────────────────────────────────────────────
--
-- THE FIRST ROWS IN THIS PROJECT THAT TWO ACCOUNTS BOTH READ. Every other table here is
-- `auth.uid() = user_id` and nothing else, so this is the first place the RLS model has to say
-- something other than "mine" — and the first place it can get that wrong in a way that shows
-- somebody else's data rather than none.
--
-- A pact is a SUM TOWARD A TARGET: no rank, no position, no demotion. CLAUDE.md's rule is that
-- an unlock may only ever ADD, and the strongest form of that here is structural rather than
-- written down — see the missing UPDATE policy on `pacts`.
--
-- ⚠ THE ORDER OF THIS FILE IS LOAD-BEARING, AND THE FIRST DRAFT HAD IT WRONG.
-- Three things depend on each other in a way that admits exactly one ordering:
--   * `is_pact_member` reads `pact_members`, and `language sql` bodies ARE resolved when the
--     function is created — so the tables must exist first. (`plpgsql` would not be checked
--     until first execution, which is the quirk that let a function be stored against a table
--     that never existed at all; see migrations/0006. Relying on that here would be trading a
--     loud error now for a silent one later.)
--   * every RLS policy calls `is_pact_member`, so the function must exist before the policies.
--   * `create_pact` and `join_pact` write both tables, so they come last.
-- Tables, then the membership test, then the policies, then the writers. Written the obvious
-- way — policies beside the table they protect — the very first run fails with
-- `function public.is_pact_member(uuid) does not exist`, and the whole migration aborts.

create table if not exists public.pacts (
  id         uuid primary key default gen_random_uuid(),
  -- The join code. ~39 bits over a 30-symbol alphabet with the look-alikes removed; see
  -- lib/pact.ts. UNIQUE so a collision is a failed insert rather than two pacts one code.
  code       text not null unique check (code ~ '^[0-9A-Z]{8}$'),
  goal_kind  text not null check (goal_kind in ('cards', 'passages', 'days')),
  target     int  not null check (target > 0 and target <= 1000000),
  starts     date not null,
  ends       date not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint pacts_window check (ends >= starts)
);

create table if not exists public.pact_members (
  pact_id     uuid not null references public.pacts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- A name the learner chose, never an email. The other member sees a label and a number and
  -- nothing else; `auth.users` is never joined by anything here.
  label       text not null check (length(btrim(label)) between 1 and 24),
  -- PUBLISHED, NOT ACCUMULATED. The client recomputes this whole from its own activity log and
  -- writes it with `set` — never an increment — so replaying a write is a no-op. See
  -- lib/pact.ts for why that is the same argument mergeActivity makes about per-day MAX.
  contributed int not null default 0 check (contributed >= 0),
  updated_at  timestamptz not null default now(),
  primary key (pact_id, user_id)
);

-- Joining is rate-limited per caller per day, because `join_pact` has to be callable by
-- somebody who cannot yet SEE the pact — which makes it a code oracle by construction. Same
-- shape as ai_usage: the day is stored and compared rather than reset by a scheduled job,
-- because there is then nothing to run and nothing to forget to run.
create table if not exists public.pact_join_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day     date not null,
  n       int  not null default 0
);
alter table public.pact_join_attempts enable row level security;
-- No policy at all: only the SECURITY DEFINER function below ever touches it.

-- ── Membership test, and it exists to BREAK A RECURSION ───────────────────────
-- A policy on pact_members that queries pact_members to decide who may read pact_members
-- recurses until Postgres gives up. A SECURITY DEFINER function runs past RLS, so the question
-- can be answered without re-entering the policy that asked it. STABLE so the planner may call
-- it once per statement rather than once per row.
create or replace function public.is_pact_member(p_pact uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.pact_members m
    where m.pact_id = p_pact and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_pact_member(uuid) from public;
grant execute on function public.is_pact_member(uuid) to authenticated;

-- ── The policies, now that the test they all call exists ──────────────────────
alter table public.pacts enable row level security;
drop policy if exists "pacts member select" on public.pacts;
create policy "pacts member select" on public.pacts
  for select using (public.is_pact_member(id));
-- THERE IS DELIBERATELY NO UPDATE AND NO DELETE POLICY ON THIS TABLE, and that is the
-- additions-only rule enforced by the absence of a thing rather than by a comment. With no
-- UPDATE policy the target cannot be lowered, the window cannot be shortened, and nobody can
-- quietly move the goal after somebody has worked toward it. There is also no INSERT policy:
-- every write happens through the SECURITY DEFINER functions below, the same posture
-- `ai_usage` already takes.

alter table public.pact_members enable row level security;
drop policy if exists "pact_members visible to members" on public.pact_members;
drop policy if exists "pact_members own update" on public.pact_members;
create policy "pact_members visible to members" on public.pact_members
  for select using (public.is_pact_member(pact_id));
-- A member may publish THEIR OWN number and no one else's. Both halves are needed: `using`
-- picks the rows they may touch, `with check` stops them rewriting the row to belong to
-- somebody else on the way out.
create policy "pact_members own update" on public.pact_members
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Creating a pact ───────────────────────────────────────────────────────────
-- One statement, so a pact can never exist with nobody in it: the row and its creator's
-- membership are inserted together or not at all.
create or replace function public.create_pact(p_code text, p_goal text, p_target int, p_starts date, p_ends date, p_label text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  is_anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  new_id  uuid;
begin
  -- An anonymous account is minted by clearing site data and has no cloud row at all
  -- (AuthProvider calls storage.resetToLocal for one), so a pact held by one is a promise to
  -- somebody else that vanishes on the next cache clear.
  if uid is null or is_anon then
    raise exception 'pact: sign in with an account first';
  end if;

  insert into public.pacts (code, goal_kind, target, starts, ends, created_by)
  values (upper(p_code), p_goal, p_target, p_starts, p_ends, uid)
  returning id into new_id;

  insert into public.pact_members (pact_id, user_id, label)
  values (new_id, uid, btrim(p_label));

  return new_id;
end;
$$;

revoke all on function public.create_pact(text, text, int, date, date, text) from public;
grant execute on function public.create_pact(text, text, int, date, date, text) to authenticated;

-- ── Joining one ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER because of a chicken-and-egg that no policy can express: the caller cannot
-- SELECT the pact they are trying to join, since the select policy requires membership and they
-- have none yet. So the lookup happens past RLS, and everything that protects it is here.
create or replace function public.join_pact(p_code text, p_label text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  is_anon  boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  today    date := (now() at time zone 'utc')::date;
  attempts int;
  found    uuid;
begin
  if uid is null or is_anon then
    raise exception 'pact: sign in with an account first';
  end if;

  -- THE ATTEMPT CAP IS THE OTHER HALF OF THE CODE'S ENTROPY, and neither is sufficient alone.
  -- 39 bits is a lot to guess at 20 tries a day and nothing at all to a script left running.
  -- Counted BEFORE the lookup and for every call, so a wrong code costs an attempt whether or
  -- not it happened to exist. The row is locked so concurrent calls cannot both read the same
  -- count and both pass, the way consume_ai_credit does.
  insert into public.pact_join_attempts (user_id, day, n)
  values (uid, today, 0)
  on conflict (user_id) do nothing;

  select (case when day = today then n else 0 end) into attempts
  from public.pact_join_attempts where user_id = uid for update;

  if attempts >= 20 then
    raise exception 'pact: too many join attempts today';
  end if;

  update public.pact_join_attempts
  set day = today, n = attempts + 1
  where user_id = uid;

  select id into found from public.pacts where code = upper(btrim(p_code));
  if found is null then
    raise exception 'pact: no pact with that code';
  end if;

  insert into public.pact_members (pact_id, user_id, label)
  values (found, uid, btrim(p_label))
  on conflict (pact_id, user_id) do update set label = excluded.label;

  return found;
end;
$$;

revoke all on function public.join_pact(text, text) from public;
grant execute on function public.join_pact(text, text) to authenticated;

-- ── Push subscriptions ────────────────────────────────────────────────────────
--
-- One row per DEVICE, not per account. A learner with a phone and a laptop has two, and both
-- should ring — so the primary key is the endpoint rather than the user.
--
-- ⚠ THE ENDPOINT IS A CAPABILITY, NOT AN IDENTIFIER. Anybody holding it can push to that
-- browser without any further credential; it is the push service's own bearer URL. So this
-- table is `auth.uid() = user_id` like every other, and it is never selected by anything the
-- client can reach — only the cron route reads it, with the service-role key.
--
-- ⚠ AND THE TIMEZONE IS STORED BECAUSE THE SERVER CANNOT GUESS IT. A daily reminder fired at
-- a fixed UTC hour is breakfast for some learners and 3am for others, and a notification that
-- wakes somebody at 3am is uninstalled by morning. `tz_offset_minutes` is what the DEVICE
-- reported (`-new Date().getTimezoneOffset()`), and `hour_local` is the hour the learner
-- chose, in their own clock. The cron runs hourly and asks which rows match right now.
--
-- It is re-reported on every subscribe, because a laptop that flies to another country keeps
-- its subscription and changes its offset. Daylight saving moves it too, which is why this is
-- a stored OFFSET refreshed by the client rather than a timezone name resolved on the server:
-- the device already knows the answer and cannot get it wrong.
create table if not exists public.push_subscriptions (
  -- The push service's delivery URL for this browser. Unique by construction.
  endpoint           text primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  -- The two halves of the browser's own encryption key, from the PushSubscription. Payloads
  -- are encrypted to these, so a push service never sees the contents of a reminder.
  p256dh             text not null,
  auth               text not null,
  -- Minutes EAST of UTC, as the device reports it: UTC+2 is 120, UTC-5 is -300.
  tz_offset_minutes  int  not null default 0 check (tz_offset_minutes between -840 and 840),
  -- Which hour, on that device's own clock, the learner wants to be asked.
  hour_local         int  not null default 19 check (hour_local between 0 and 23),
  -- Set by the cron after a successful send, so one device is reminded once a day however
  -- many times the job runs. A DATE in the learner's local reckoning, not a timestamp.
  last_sent_on       date,
  created_at         timestamptz not null default now()
);

create index if not exists push_subscriptions_due_idx
  on public.push_subscriptions (hour_local, tz_offset_minutes);

alter table public.push_subscriptions enable row level security;

-- A learner may see, create, adjust and delete their OWN device registrations and nothing
-- else. There is deliberately no policy granting any form of cross-user read: the cron reads
-- this table with the service-role key, which bypasses RLS, and nothing in the browser ever
-- needs to see somebody else's endpoint.
drop policy if exists push_own_select on public.push_subscriptions;
create policy push_own_select on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists push_own_insert on public.push_subscriptions;
create policy push_own_insert on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists push_own_update on public.push_subscriptions;
create policy push_own_update on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists push_own_delete on public.push_subscriptions;
create policy push_own_delete on public.push_subscriptions
  for delete using (auth.uid() = user_id);
