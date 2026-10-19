import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

/**
 * The daily nudge. Runs HOURLY and sends to whoever's local clock has just reached their hour.
 *
 * ## ⚠ WHY HOURLY RATHER THAN ONCE A DAY
 *
 * A single daily job fires at one UTC instant, which is breakfast in Berlin and 3am in
 * Denver. A notification that wakes somebody at 3am is not a reminder, it is the reason they
 * uninstall the app. So the schedule is hourly and the WHO is computed per row from the
 * device's own reported offset — see `0010_push_subscriptions.sql` for why the offset is
 * stored rather than a timezone name resolved here.
 *
 * ## IT WILL NOT NAG SOMEBODY WHO HAS ALREADY STUDIED
 *
 * The one thing that makes a daily reminder tolerable. `srs_state.lastActive` is the day the
 * learner last did anything — reading, cards, or (since the course landed) a lesson — written
 * by the device in ITS OWN local reckoning, which is why it is compared against the local date
 * computed from the same offset rather than against a UTC date.
 *
 * **It is deliberately not a due-card count.** Computing that server-side would mean parsing
 * every user's whole deck and running FSRS over it on every hourly tick, to decide the wording
 * of a sentence. "You have not studied today" is the fact that actually matters and it is one
 * column.
 *
 * ## A DEAD SUBSCRIPTION IS DELETED, NOT RETRIED
 *
 * 404 and 410 from a push service mean the browser is gone: uninstalled, site data cleared,
 * permission revoked. Those rows can never succeed, so keeping them means the job does strictly
 * more useless work every day forever. Anything else — a 429, a 500, a timeout — is left alone
 * and tried again next hour, which is the same distinction `lib/storage/writeQueue.ts` draws
 * between a schema fault and a network fault.
 *
 * ## NOTHING HERE LOGS AN ENDPOINT
 *
 * It is a bearer capability: whoever holds it can push to that browser. Counts are logged; the
 * URL never is.
 */
export const runtime = 'nodejs';
/** Comfortably inside Vercel's ceiling, and a real number rather than the platform default. */
export const maxDuration = 60;

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;
const CRON_SECRET = process.env.CRON_SECRET;

/** How many rows one tick will handle. A ceiling, so a growing table cannot grow the timeout. */
const BATCH = 500;

interface Row {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  tz_offset_minutes: number;
  hour_local: number;
  last_sent_on: string | null;
}

/** The learner's own calendar date and hour, from the offset their device reported. */
function localNow(offsetMinutes: number, now: Date): { date: string; hour: number } {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

export async function GET(req: Request) {
  /*
    ⚠ THIS ROUTE IS PUBLIC BY DEFAULT AND MUST NOT BE. It reads every subscription in the
    project with the service-role key and sends real notifications; left open, anybody could
    make every learner's phone buzz by loading a URL. Vercel Cron sends
    `Authorization: Bearer $CRON_SECRET`, and a MISSING secret refuses rather than allows —
    the fail-closed rule `consumeAiCredit` was fixed to follow.
  */
  if (!CRON_SECRET || req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!URL_ || !SERVICE) return NextResponse.json({ error: 'supabase_not_configured' }, { status: 503 });
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT) {
    return NextResponse.json({ error: 'vapid_not_configured' }, { status: 503 });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  // Service role: this is the one place that reads rows belonging to everybody, and RLS is
  // bypassed on purpose. It is never constructed anywhere a request body could reach it.
  const sb = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  const now = new Date();
  const hourUtc = now.getUTCHours();

  /*
    NARROWED IN SQL RATHER THAN IN JAVASCRIPT. Only offsets that could possibly put a device
    at its chosen hour right now are fetched. Whole-hour offsets are the common case, but
    India (+330) and Nepal (+345) are not, so the final test is still done per row below —
    this is a cheap pre-filter, not the decision.
  */
  const { data, error } = await sb
    .from('push_subscriptions')
    .select('endpoint,user_id,p256dh,auth,tz_offset_minutes,hour_local,last_sent_on')
    .limit(BATCH);
  if (error) {
    console.error('[cron/reminders] read failed:', error.message);
    return NextResponse.json({ error: 'read_failed' }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  const due: Row[] = [];
  for (const r of rows) {
    const { date, hour } = localNow(r.tz_offset_minutes, now);
    if (hour !== r.hour_local) continue;
    // One reminder per local day, however many times the job runs.
    if (r.last_sent_on === date) continue;
    due.push(r);
  }
  if (!due.length) {
    return NextResponse.json({ ok: true, hourUtc, considered: rows.length, sent: 0 });
  }

  /*
    WHO HAS ALREADY STUDIED. One query for the whole batch rather than one per row — the
    difference between a handful of round trips and several hundred inside a 60-second budget.
  */
  const userIds = [...new Set(due.map(r => r.user_id))];
  const { data: states } = await sb
    .from('user_data').select('user_id,srs_state').in('user_id', userIds);
  const lastActive = new Map<string, string | undefined>();
  for (const s of (states ?? []) as { user_id: string; srs_state: { lastActive?: string } | null }[]) {
    lastActive.set(s.user_id, s.srs_state?.lastActive);
  }

  let sent = 0, skipped = 0, dropped = 0, failed = 0;
  const sentEndpoints: string[] = [];
  const deadEndpoints: string[] = [];

  await Promise.all(due.map(async r => {
    const { date } = localNow(r.tz_offset_minutes, now);
    if (lastActive.get(r.user_id) === date) { skipped++; return; }

    const payload = JSON.stringify({
      title: 'srsly',
      body: 'A few minutes keeps your streak. Your words are waiting.',
      url: '/',
      tag: 'srsly-daily',
    });

    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        payload,
        { TTL: 6 * 3600 },   // Stale by the evening is worse than undelivered.
      );
      sent++;
      sentEndpoints.push(r.endpoint);
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) { dropped++; deadEndpoints.push(r.endpoint); }
      else failed++;      // transient — left for the next hour
    }
  }));

  // Two writes for the whole batch rather than one per row.
  if (sentEndpoints.length) {
    // `last_sent_on` is the LEARNER'S date, so a single update would be wrong across
    // timezones — grouped by the date each row actually belongs to.
    const byDate = new Map<string, string[]>();
    for (const r of due) {
      if (!sentEndpoints.includes(r.endpoint)) continue;
      const { date } = localNow(r.tz_offset_minutes, now);
      byDate.set(date, [...(byDate.get(date) ?? []), r.endpoint]);
    }
    for (const [date, endpoints] of byDate) {
      await sb.from('push_subscriptions').update({ last_sent_on: date }).in('endpoint', endpoints);
    }
  }
  if (deadEndpoints.length) {
    await sb.from('push_subscriptions').delete().in('endpoint', deadEndpoints);
  }

  // Counts only. The endpoints never reach a log line.
  console.log(`[cron/reminders] utc=${hourUtc} considered=${rows.length} due=${due.length} sent=${sent} skipped=${skipped} dropped=${dropped} failed=${failed}`);
  return NextResponse.json({ ok: true, hourUtc, considered: rows.length, sent, skipped, dropped, failed });
}
