-- `passages` — one row per generated daily passage (see src/lib/server/data.ts). Run in the
-- Supabase SQL editor. Supersedes the old `poc_user_data.daily` jsonb blob: each passage now
-- carries its own per-blank fill progress and the words added while reading it, instead of one
-- undifferentiated blob per user.

create table if not exists passages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  lang         text not null default 'zh',
  date         date not null,
  passage_idx  int not null default 0,      -- future multi-passage/day; PoC only ever writes 0
  passage      jsonb not null,              -- RawPassage { title, sentences } — raw tokens, as today
  progress     jsonb not null default '{}'::jsonb,  -- { "${si}-${ti}": 0 | 1 }; unfilled = key absent
  added_words  jsonb not null default '[]'::jsonb,  -- hanzi[] added while reading THIS passage
  created_at   timestamptz not null default now(),
  unique (user_id, date, lang, passage_idx)
);

alter table passages enable row level security;

drop policy if exists "passages self" on passages;
create policy "passages self" on passages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists passages_user_date_idx on passages(user_id, date);

-- Superseded by the table above.
alter table poc_user_data drop column if exists daily;

-- ── Auto-expiry: drop rows older than 24h ──────────────────────────────────────
-- Requires the pg_cron extension. In the Supabase dashboard: Database → Extensions → enable
-- "pg_cron" (or just run the `create extension` line below — it's pre-authorized in Supabase's
-- managed Postgres). The job runs as `postgres`, which bypasses RLS, so it can delete across all
-- users regardless of the "passages self" policy above.
create extension if not exists pg_cron with schema extensions;

-- Re-runnable: drop any existing job with this name before (re)creating it.
select cron.unschedule(jobid) from cron.job where jobname = 'delete-old-passages';
select cron.schedule(
  'delete-old-passages',
  '0 * * * *',  -- hourly
  $$ delete from public.passages where created_at < now() - interval '24 hours'; $$
);

-- To change the schedule or query later: select cron.alter_job(job_id, schedule => '...', command => '...')
-- (find job_id via `select * from cron.job where jobname = 'delete-old-passages';`).
-- To remove it entirely: select cron.unschedule('delete-old-passages');
