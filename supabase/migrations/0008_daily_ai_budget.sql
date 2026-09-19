-- 0008 — a shared free-tier key, a daily budget, and the account hole that came with it
--
-- WHAT CHANGED AND WHY THE EARLIER REASONING DOES NOT APPLY. `guest_limit` was 0 and a
-- signed-in account was UNLIMITED. Both were correct for the key this was written against —
-- an Anthropic key with a card behind it, where funding strangers is an open-ended bill, and
-- where the only real lock was SRSLY_API_KEY being unset in production.
--
-- This deployment now sets one on purpose: a FREE-TIER key, so somebody opening the site can
-- generate a passage without first going and registering with an AI provider. That is a
-- different risk rather than a smaller version of the same one — a free tier has no bill to
-- run up, so the worst case is the shared quota being spent and the app saying so.
-- `GenerationError` already turns a provider 429 into "the free tier is rate-limited, wait a
-- few minutes" rather than a generic failure.
--
-- ⚠ THAT WHOLE ARGUMENT DEPENDS ON THE KEY BEING FREE-TIER. A Google AI Studio key belonging
-- to a Cloud project with BILLING ENABLED silently uses the paid tier. If that is ever true of
-- the configured key, these numbers are guarding real money, and the exposure is `guest_limit`
-- times however many browsers exist.
--
-- THE ACCOUNT HOLE IS THE PART NOBODY ASKED ABOUT. The guest cap has been described, here and
-- in CLAUDE.md, as the thing standing between a public deployment and its own key. It never
-- was: `if not is_anon then ... return allowed` handed every signed-in account UNLIMITED
-- operator-funded generation, and signing up is free and takes a moment. Capping guests at 3
-- while leaving that open would have been a lock on the window beside an open door.
--
-- IT REMAINS A SPEED BUMP. The budget is per ACCOUNT, and an anonymous account is minted by
-- clearing site data — the same objection that made 5 indefensible for an Anthropic key. It is
-- defensible here only because what it protects is a quota rather than a bill. A per-IP
-- backstop is still the thing nobody has written.
--
-- The counter resets by comparing a stored UTC `day` rather than by a scheduled job: there is
-- nothing to run, and nothing to forget to run.

alter table public.ai_usage add column if not exists day date;

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

-- Idempotent, and belt-and-braces rather than redundant: `create or replace function`
-- PRESERVES existing privileges, so this does not reset them — but a project whose function
-- was ever created fresh would have defaulted to PUBLIC, which is how the legacy overload
-- dropped in 0006 came to be world-callable.
revoke all on function public.consume_ai_credit() from public;
revoke execute on function public.consume_ai_credit() from anon;
grant execute on function public.consume_ai_credit() to authenticated;
