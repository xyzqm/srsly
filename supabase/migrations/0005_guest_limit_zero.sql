-- 0005 — the guest AI budget goes to zero
--
-- It was 5 operator-funded generations per anonymous guest. That is a stranger's Anthropic
-- bill left open to the internet, and the shape of the budget is what makes 5 no safer than
-- 500: it is metered per ANONYMOUS SESSION, so clearing site data mints a fresh allowance and
-- nothing here makes that hard to script. A small number is a speed bump wearing a cap's
-- clothes.
--
-- The rest of the app already answered this question. Generation is BRING-YOUR-OWN-KEY —
-- roughly a cent a passage, billed to the learner, on a key that lives only in their browser
-- — and `generator.operatorPays` means a learner spending their own money is never metered at
-- all. This line was the one place still offering to pay for someone else's tokens.
--
-- WHAT IT DOES NOT DO, because a half-closed door described as shut is worse than an open
-- one. Only /api/daily-content consumes a credit; /api/missed-review still falls back to the
-- operator's key with no meter. What actually keeps a public deployment from spending is
-- SRSLY_API_KEY and ANTHROPIC_API_KEY being UNSET there — and on that deployment the no-key
-- 503 fires before the meter is ever reached, so this function is not even consulted. This is
-- the second lock: the one that still holds the day someone sets a key.
--
-- IDEMPOTENT, and safe to run over a database whose limit was raised by hand. `ai_usage` is
-- untouched: the counters stay as they are and simply stop mattering, so raising the number
-- again restores the old behaviour exactly.
--
-- supabase/schema.sql holds the same definition and is the source of truth; this file exists
-- so an EXISTING project picks the change up by following the migration list, which is how
-- every other change to this database has been applied.

create or replace function public.consume_ai_credit()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid         uuid    := auth.uid();
  is_anon     boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  guest_limit int     := 0;
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
