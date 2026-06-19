import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseServerEnabled = !!(URL && ANON);

/**
 * Supabase client for Route Handlers, bound to the request cookies so it resolves the
 * caller's session (anonymous or signed-in). Returns null when Supabase isn't configured.
 */
export async function getSupabaseServer() {
  if (!supabaseServerEnabled) return null;
  const store = await cookies();
  return createServerClient(URL!, ANON!, {
    cookies: {
      getAll() { return store.getAll(); },
      setAll(toSet) {
        // Route Handlers may have a read-only cookie store; ignore if so.
        try { toSet.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only */ }
      },
    },
  });
}

/**
 * Consume one AI credit for the caller. Returns `allowed:false` only when an anonymous
 * guest has hit the budget (the routes then return 402 without spending money). When
 * Supabase isn't configured, or on a transient error, it fails OPEN (allowed) so the app
 * keeps working and a hiccup never blocks legitimate use.
 */
export async function consumeAiCredit(): Promise<{ allowed: boolean; remaining: number | null; reason?: string }> {
  const sb = await getSupabaseServer();
  if (!sb) return { allowed: true, remaining: null };
  const { data, error } = await sb.rpc('consume_ai_credit');
  if (error) { console.error('[consumeAiCredit]', error.message); return { allowed: true, remaining: null }; }
  const r = (data ?? {}) as { allowed?: boolean; remaining?: number | null; reason?: string };
  return { allowed: r.allowed !== false, remaining: r.remaining ?? null, reason: r.reason };
}

/**
 * True only when the caller is an anonymous guest (Supabase enabled + anonymous session).
 * Used to give guests the free keyword-grading fallback while reserving AI grading for
 * signed-in accounts — without spending the passage-generation budget. Auth off → false.
 */
export async function isAnonymousGuest(): Promise<boolean> {
  const sb = await getSupabaseServer();
  if (!sb) return false;
  const { data: { user } } = await sb.auth.getUser();
  return !!user && user.is_anonymous === true;
}
