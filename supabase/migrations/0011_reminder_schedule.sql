-- 0011_reminder_schedule.sql — the hourly tick that sends reminders.
--
-- ⚠ THIS IS NOT OPTIONAL ON A HOBBY PLAN — IT IS THE ONLY WAY THE REMINDERS RUN.
--
-- ## WHY THERE IS NO `vercel.json`
--
-- `/api/cron/reminders` must run HOURLY, because each learner is reminded at an hour on THEIR
-- OWN clock and a daily job fires at one UTC instant — breakfast in Berlin, 3am in Denver.
--
-- A `vercel.json` declaring `0 * * * *` was written first and **deleted**, because Vercel's
-- Hobby plan refuses it outright at deploy time:
--
--     Error: Hobby accounts are limited to daily cron jobs. This cron expression (0 * * * *)
--     would run more than once per day.
--
-- That is a BLOCKED DEPLOY, not a degraded feature — the whole site stops shipping until the
-- file goes. (An earlier note in CLAUDE.md predicted Vercel would accept it and quietly run it
-- daily. It does not, and loud is the better of the two behaviours.)
--
-- Dropping to `0 9 * * *` to satisfy Hobby was rejected: it would send every learner a
-- notification at 09:00 UTC regardless of where they are, which is 2am in Los Angeles and
-- 6pm in Sydney. A reminder that wakes somebody at 2am is the reason they uninstall the app,
-- so a wrong-hour reminder is worse than no reminder.
--
-- Postgres has no such limit. `pg_cron` + `pg_net` call the route from the database side on a
-- real hourly schedule, which is what the route was designed around.
--
-- ## IF YOU EVER MOVE TO VERCEL PRO
--
-- Recreate `vercel.json` at the repo root with exactly this, and then UNSCHEDULE the job below
-- (`select cron.unschedule('srsly-reminders');`) so the two do not both fire:
--
--     {
--       "$schema": "https://openapi.vercel.sh/vercel.json",
--       "crons": [{ "path": "/api/cron/reminders", "schedule": "0 * * * *" }]
--     }
--
-- ## RUN THIS BY HAND, WITH YOUR OWN VALUES
--
-- It is NOT part of schema.sql, deliberately: it embeds a deployment URL and a secret, neither
-- of which belongs in a file that is committed. Replace both placeholders below and run it in
-- the Supabase SQL editor. `tests/sync.test.ts` reads schema.sql and the migrations for COLUMN
-- definitions; there are none here, so nothing is being hidden from it.
--
-- The secret must match the `CRON_SECRET` environment variable the route checks. Without a
-- match the route answers 401 and sends nothing — which is the fail-closed behaviour it wants,
-- and also exactly what a typo here looks like, so check `cron.job_run_details` if reminders
-- are silent.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: re-running this file replaces the schedule rather than adding a second one,
-- which would double every learner's reminders.
select cron.unschedule('srsly-reminders')
  where exists (select 1 from cron.job where jobname = 'srsly-reminders');

select cron.schedule(
  'srsly-reminders',
  '0 * * * *',
  $$
  select net.http_get(
    url     := 'https://YOUR-DEPLOYMENT.vercel.app/api/cron/reminders',
    headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Useful afterwards:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
