-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Creates the PoC's own table so it never collides with the React app's `user_data`.

create table if not exists poc_user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  deck       jsonb not null default '[]'::jsonb,  -- DeckWord[] (ts-fsrs Card + h/p/m/id)
  prefs      jsonb not null default '{}'::jsonb,  -- { theme, hskLevel }
  daily      jsonb,                               -- today's raw passage + fill items
  updated_at timestamptz not null default now()
);

alter table poc_user_data enable row level security;

-- Each user (including anonymous sessions) can read/write only their own row.
create policy "poc_user_data self" on poc_user_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
