import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseServerEnabled = !!(URL && ANON);

export async function getSupabaseServer() {
  if (!supabaseServerEnabled) return null;
  const store = await cookies();
  return createServerClient(URL!, ANON!, {
    cookies: {
      getAll() { return store.getAll(); },
      setAll(toSet) {
        try { toSet.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only */ }
      },
    },
  });
}

/**
 * Consume one AI credit for the caller. Guests (anonymous sessions) are capped by the
 * server-side budget in consume_ai_credit() (supabase/schema.sql); real accounts are
 * unlimited. The function takes NO arguments — the limit lives in the SQL. (Passing one
 * makes the RPC 404 and silently fail open, which is the unlimited-for-everyone bug.)
 */
export async function consumeAiCredit(): Promise<{ allowed: boolean; remaining: number | null; reason?: string }> {
  const sb = await getSupabaseServer();
  if (!sb) return { allowed: true, remaining: null };

  const { data, error } = await sb.rpc('consume_ai_credit');

  /**
   * FAILS CLOSED, AND IT USED TO FAIL OPEN — which is the bug the docstring above already
   * names ("silently fail open, which is the unlimited-for-everyone bug") three lines before
   * the code that did it.
   *
   * An error here means the meter could not be read: the RPC is missing, the grant was
   * revoked, the network blipped. Returning `allowed: true` turned every one of those into an
   * UNMETERED generation on the operator's key — the exact outcome metering exists to prevent,
   * reached by the one path nobody tests. It was found while considering whether to revoke
   * EXECUTE from the `anon` role, which would have converted a safe `no_session` refusal into
   * precisely this: permission denied, error, allowed, billed.
   *
   * The cost of failing closed is that a genuine Supabase outage refuses operator-funded
   * generation instead of giving it away. That is the right way round, and it is narrow: a
   * learner on their own key never reaches the meter at all, and `!sb` above — Supabase not
   * configured — is still "no metering", because that is an answer rather than a failure.
   */
  if (error) {
    console.error('[consumeAiCredit]', error.message);
    return { allowed: false, remaining: null, reason: 'unverified' };
  }

  const r = (data ?? {}) as { allowed?: boolean; remaining?: number | null; reason?: string };
  return { allowed: r.allowed !== false, remaining: r.remaining ?? null, reason: r.reason };
}

export async function isAnonymousGuest(): Promise<boolean> {
  const sb = await getSupabaseServer();
  if (!sb) return false;
  const { data: { user } } = await sb.auth.getUser();
  return !!user && user.is_anonymous === true;
}
