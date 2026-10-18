-- 0010_push_subscriptions.sql — where a reminder is delivered, and when.
--
-- Run this on an EXISTING project; schema.sql creates the same objects for a new one, and the
-- two definitions are identical on purpose. tests/sync.test.ts reads both.

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
