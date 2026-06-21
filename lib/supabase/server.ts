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

  if (error) {
    console.error('[consumeAiCredit]', error.message);
    return { allowed: true, remaining: null };
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
