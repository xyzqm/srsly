-- 0009_pacts.sql — co-op reading pacts: the first rows two accounts both read.
--
-- Run this on an EXISTING project; schema.sql creates the same objects for a new one, and
-- the two definitions are identical on purpose. tests/sync.test.ts forbids a second
-- signature for any function name across both files, because a `revoke` protects the
-- signature it names and never the name — which is exactly how a legacy
-- consume_ai_credit(p_limit integer) stayed world-callable past its own revoke.

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
