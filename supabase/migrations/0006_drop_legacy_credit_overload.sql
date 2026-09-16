-- 0006 — drop the legacy consume_ai_credit(integer), which PUBLIC could execute
--
-- The live database held TWO functions called consume_ai_credit. The repo defines one, with no
-- arguments; the other took `p_limit integer` and belonged to an earlier design that counted
-- rows in a table called `ai_generations`. Neither `ai_generations` nor `p_limit` appears
-- anywhere in this repository. It was applied to the project by hand and the repo never learned
-- about it — the same drift that once left `decks`, `shelf` and `passage_state` living only in a
-- code comment, found this time only because a check of what `guest_limit` had ACTUALLY been set
-- to returned two rows instead of one.
--
-- WHY IT HAD TO GO, stated exactly:
--
--   1. THE CALLER SUPPLIED THEIR OWN LIMIT. The body tested `IF cur >= p_limit`, so the budget
--      was whatever the request asked for. `{"p_limit": 2147483647}` is an unlimited account.
--   2. `p_limit` IS A NAMED PARAMETER, so PostgREST could invoke it over the public REST API.
--      An unnamed one would have been uncallable; this was not.
--   3. PUBLIC HELD EXECUTE. Its ACL began `=X/postgres` — an empty grantee means PUBLIC — which
--      is simply the Postgres default for a new function. schema.sql's
--      `revoke all on function public.consume_ai_credit() from public` names ONE SIGNATURE and
--      never touched this one. The anon key that reaches it ships in the client bundle.
--   4. SECURITY DEFINER, so it ran as the owner and wrote to `ai_generations` past RLS.
--
-- WHAT IT DID NOT DO, because a hole described as worse than it is gets fixed once and then
-- distrusted: it could not spend Anthropic tokens. `lib/supabase/server.ts` calls
-- `rpc('consume_ai_credit')` with NO arguments, which binds to the zero-argument function, and
-- nothing in the codebase has ever called this one. The realistic abuse was unauthenticated,
-- RLS-bypassing INSERTs into a table nothing reads — row bloat, not a bill.
--
-- `ai_generations` IS DELIBERATELY LEFT ALONE. Dropping a function removes the reachable
-- surface; dropping a table destroys whatever is in it, and that is a separate decision made
-- while looking at the row count rather than folded into a security fix.

drop function if exists public.consume_ai_credit(integer);

-- Idempotent, and belt-and-braces rather than redundant: it re-states the lock for a project
-- whose function was ever created without it. `create or replace function` PRESERVES existing
-- privileges, so 0005 did not reset these — but a fresh `create` would have defaulted to PUBLIC
-- again, which is exactly how the dropped overload came to be executable by anyone.
revoke all on function public.consume_ai_credit() from public;
grant execute on function public.consume_ai_credit() to authenticated;
