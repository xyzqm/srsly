import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Stop reminders for ONE device.
 *
 * Deliberately not "for this account": a learner turning reminders off on their laptop has
 * said nothing about their phone, and silently unsubscribing every device would be the kind of
 * over-reach that makes somebody turn the feature off for good.
 *
 * RLS does the authorisation — the delete policy is `auth.uid() = user_id` — so passing
 * somebody else's endpoint deletes nothing rather than deleting theirs. The `user_id` filter
 * below is belt and braces and costs nothing.
 *
 * It answers OK when the row was already gone. Unsubscribing something that is not subscribed
 * is the desired state reached, not an error, and reporting it as one would make the client
 * retry forever.
 */
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const sb = await getSupabaseServer();
  if (!sb) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 });

  let endpoint: string | undefined;
  try { endpoint = (await req.json())?.endpoint; } catch { /* handled below */ }
  if (!endpoint) return NextResponse.json({ error: 'no_endpoint' }, { status: 400 });

  const { error } = await sb.from('push_subscriptions')
    .delete().eq('endpoint', endpoint).eq('user_id', user.id);

  if (error) {
    console.error('[push/unsubscribe]', error.message);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
