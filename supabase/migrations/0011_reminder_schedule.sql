-- 0011_reminder_schedule.sql — the hourly tick that sends reminders.
--
-- ⚠ THIS FILE IS OPTIONAL AND IS THE ALTERNATIVE TO `vercel.json`, NOT AN ADDITION TO IT.
-- Running both means every learner is considered twice an hour. Pick one; see below.
--
-- ## WHY THIS EXISTS WHEN vercel.json ALREADY DECLARES THE SAME SCHEDULE
--
-- `/api/cron/reminders` has to run HOURLY, because each learner is reminded at an hour on
-- THEIR OWN clock and a daily job fires at one UTC instant — breakfast in Berlin, 3am in
-- Denver. **Vercel's Hobby plan runs cron jobs once per day**, so the `0 * * * *` in
-- vercel.json is a Pro-plan schedule. On Hobby it will be accepted and then effectively run
-- daily, which does not break anything visibly: most learners simply never reach their hour
-- while the job happens to be awake, and reminders look like they silently do not work.
--
-- Postgres has no such limit. `pg_cron` + `pg_net` call the route from the database side on a
-- real hourly schedule, so this is the better fit for a Hobby deployment — and it is the one
-- the app was designed around.
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
