-- srsly Supabase schema — per-user data + server-enforced guest AI budget.
--
-- SETUP (one time):
--   1. Create a Supabase project.
--   2. Run this whole file in the SQL editor.
--   3. Authentication → Providers: enable "Anonymous sign-ins", "Email", and "Google".
--   4. Put the project URL + anon key in .env.local as:
--        NEXT_PUBLIC_SUPABASE_URL=...
--        NEXT_PUBLIC_SUPABASE_ANON_KEY=...
--
-- NOTE: the guest limit (5) is enforced in consume_ai_credit() below — the server is the
-- source of truth. Keep it in sync with GUEST_AI_LIMIT in lib/aiBudget.ts (UI mirror only).

-- ── Per-user data (deck / prefs / SRS state as JSONB blobs) ───────────────────
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  deck       jsonb,
  prefs      jsonb,
  srs_state  jsonb,
  updated_at timestamptz not null default now()
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
  guest_limit int     := 5;
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
