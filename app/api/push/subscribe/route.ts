import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Register THIS device for daily reminders.
 *
 * ## ONE ROW PER DEVICE, UPSERTED ON THE ENDPOINT
 *
 * A learner with a phone and a laptop should be reminded on both, so the key is the push
 * endpoint rather than the account. Upsert rather than insert because re-enabling, changing
 * the hour, or simply flying to another timezone all arrive here as the same endpoint with
 * different details — an insert would collide and a delete-then-insert would lose the row for
 * however long the two statements take.
 *
 * ## ⚠ THE ENDPOINT IS A BEARER CAPABILITY AND IS NEVER LOGGED
 *
 * Anybody holding it can push to that browser. It is written to its own row and nowhere else:
 * not into a log line, not into an error message, not into a URL. That is the rule
 * `lib/server/generator.ts` states for an API key, and it applies here for the same reason —
 * a logged credential is a leaked one.
 *
 * ## AUTHENTICATION IS RLS, NOT A CHECK IN THIS FILE
 *
 * The row carries `user_id` and the policy is `auth.uid() = user_id`, so a caller who is not
 * signed in writes nothing and a caller cannot write somebody else's row even by asking. The
 * explicit `getUser()` below is for the ERROR MESSAGE rather than the security: without it an
 * anonymous caller gets an opaque RLS violation instead of "sign in first".
 */
export const runtime = 'nodejs';

interface Body {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  tzOffsetMinutes?: number;
  hourLocal?: number;
}

export async function POST(req: Request) {
  const sb = await getSupabaseServer();
  if (!sb) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const { data: { user } } = await sb.auth.getUser();
  if (!user || user.is_anonymous) {
    // Reminders need somewhere to come back to. An anonymous session is per-browser and is
    // discarded on a clear-site-data, so a subscription tied to one is a row that outlives
    // the account that owns it.
    return NextResponse.json({ error: 'sign_in_required' }, { status: 401 });
  }

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'incomplete_subscription' }, { status: 400 });
  }

  /*
    CLAMPED RATHER THAN TRUSTED. These two numbers decide WHEN somebody's phone lights up, and
    they arrive from a client. The SQL has the same checks — so a bad value is refused twice —
    but a check constraint failure surfaces as a 500, and a value quietly clamped into range
    is a reminder at a slightly wrong hour rather than a feature that silently never works.
  */
  const tz = clamp(Math.trunc(body.tzOffsetMinutes ?? 0), -840, 840);
  const hour = clamp(Math.trunc(body.hourLocal ?? 19), 0, 23);

  const { error } = await sb.from('push_subscriptions').upsert({
    endpoint, user_id: user.id, p256dh, auth,
    tz_offset_minutes: tz,
    hour_local: hour,
    // Cleared on every re-subscribe: changing your reminder hour should take effect today,
    // not tomorrow, and a stale `last_sent_on` would suppress exactly that.
    last_sent_on: null,
  }, { onConflict: 'endpoint' });

  if (error) {
    // The message, never the endpoint.
    console.error('[push/subscribe]', error.message);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}
