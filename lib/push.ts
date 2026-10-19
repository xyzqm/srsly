/**
 * ── WHAT THIS NEEDS TO ACTUALLY DELIVER ANYTHING ────────────────────────────
 * The fence that stood here is gone, because the rest shipped: the subscribe and unsubscribe
 * routes, the hourly cron, the `push` and `notificationclick` handlers in `public/sw.js`, and
 * the Settings panel. Four environment variables still have to be set or nothing is sent —
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET`, plus
 * `SUPABASE_SERVICE_ROLE_KEY` for the cron. With the public key unset, `pushAvailability()`
 * answers `not-configured` and the panel says so rather than offering a control that cannot
 * work. See `.env.example` and `scripts/gen-vapid.mjs`.
 *
 * (`web-push` is earned on the SEND path only — RFC 8291 payload encryption is ECDH, HKDF and
 * AES-128-GCM, which is not something to hand-roll. Key generation deliberately does not use
 * it; `scripts/gen-vapid.mjs` says why.)
 */

/**
 * Daily reminders: the browser half.
 *
 * ## WHY THIS NEEDS A SERVER AT ALL
 *
 * The obvious build is `setTimeout` plus `new Notification()`, and it cannot work: a page only
 * runs while it is open, and the entire point of a reminder is to arrive when the app is shut.
 * Web Push is the only mechanism that does — the push service holds the message and wakes the
 * service worker, with the tab closed and the browser quit.
 *
 * ## ⚠ ON iOS IT WORKS ONLY FROM THE HOME SCREEN, AND THAT IS NOT A BUG WE CAN FIX
 *
 * Safari has supported Web Push since 16.4 for **installed web apps only**. In a normal Safari
 * tab `PushManager` is simply absent — so a learner on an iPhone who taps "remind me" gets
 * nothing, with no error to read, unless they have added srsly to their Home Screen first.
 *
 * `pushAvailability()` separates that case from ordinary unsupported, because the two need
 * completely different sentences: one is "your browser cannot do this" and the other is "add
 * this to your Home Screen and it can". Collapsing them would be this repo's most-repeated
 * mistake — a value meaning "not yet" rendered as a value meaning "never".
 *
 * ## THE SUBSCRIPTION IS A CAPABILITY
 *
 * `subscription.endpoint` is a bearer URL: anybody holding it can push to that browser. It
 * goes straight to our own API over HTTPS and is never logged, never put in a URL, and never
 * stored anywhere but the row it belongs to — the same rule `lib/server/generator.ts` states
 * for an API key.
 */

/** Set at build time; absent means reminders were never configured for this deployment. */
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export type PushAvailability =
  /** Everything needed is present. */
  | { kind: 'ready' }
  /** iOS Safari in a normal tab: supported, but only once added to the Home Screen. */
  | { kind: 'needs-install' }
  /** No service worker or no Push API — an old browser, or a private window. */
  | { kind: 'unsupported' }
  /** The deployment has no VAPID key, so nothing could be sent even if we subscribed. */
  | { kind: 'not-configured' };

/**
 * Is the page running as an installed app rather than in a browser tab?
 *
 * Two checks because the two platforms answer differently: `display-mode: standalone` is the
 * standard and `navigator.standalone` is Safari's own, which predates it and is still the only
 * one iOS sets for a Home Screen app.
 */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const legacy = (navigator as { standalone?: boolean }).standalone === true;
  return legacy || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** Roughly, is this iOS or iPadOS? Used only to pick which sentence to show. */
export function isApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS 13+ reports as a Mac, so the touch-point count is what separates an iPad from a
  // desktop Safari — where push works in an ordinary tab and no install prompt is wanted.
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function pushAvailability(): PushAvailability {
  if (typeof window === 'undefined') return { kind: 'unsupported' };
  if (!VAPID_PUBLIC) return { kind: 'not-configured' };
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;
  if (supported) return { kind: 'ready' };
  // An Apple device without PushManager is the install case, not the dead end: adding to the
  // Home Screen is what turns it on. Anywhere else, a missing PushManager really is the end.
  if (isApple() && !isInstalled()) return { kind: 'needs-install' };
  return { kind: 'unsupported' };
}

/**
 * The applicationServerKey the Push API wants: raw bytes, not the base64url string.
 *
 * Passing the string works in no browser and fails differently in each, which is why this is
 * its own function with its own name rather than an inline expression.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export interface ReminderPrefs {
  /** The hour on THIS device's clock the learner wants to be asked. */
  hourLocal: number;
}

/**
 * Ask for permission and register this device.
 *
 * Returns the reason on failure rather than throwing, because every one of these is a thing
 * the learner did or their browser decided, not a bug: `denied` in particular is permanent
 * until they change it in site settings, and the UI has to say so rather than offering the
 * button again.
 */
export async function enableReminders(prefs: ReminderPrefs): Promise<
  { ok: true } | { ok: false; reason: 'denied' | 'dismissed' | 'unsupported' | 'failed' }
> {
  if (pushAvailability().kind !== 'ready') return { ok: false, reason: 'unsupported' };
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return { ok: false, reason: 'denied' };
    if (permission !== 'granted') return { ok: false, reason: 'dismissed' };

    const reg = await navigator.serviceWorker.ready;
    /*
      REUSE AN EXISTING SUBSCRIPTION RATHER THAN CREATING A SECOND.
      `subscribe()` with a DIFFERENT applicationServerKey throws on a browser that already
      holds one, which is what a VAPID rotation looks like from here. Taking the existing
      subscription when there is one keeps a re-enable idempotent; the rotation case is handled
      by `disableReminders` first, which is what the UI does on a failed re-subscribe.
    */
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      // Required by every browser: a push may not be silent. We always show something.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        // Minutes EAST of UTC. getTimezoneOffset() is minutes BEHIND, so it is negated —
        // getting this backwards fires every reminder at the mirror image of the right hour.
        tzOffsetMinutes: -new Date().getTimezoneOffset(),
        hourLocal: prefs.hourLocal,
      }),
    });
    if (!res.ok) return { ok: false, reason: 'failed' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Stop reminders on THIS device, and forget the row. */
export async function disableReminders(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;
    // The server row goes FIRST. Unsubscribing locally first would leave a row the cron keeps
    // pushing to, which the push service answers 410 for — recoverable, but it means a learner
    // who turned reminders off is still being sent to until a send happens to fail.
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe();
    return true;
  } catch {
    return false;
  }
}

/** Is this device currently registered? Cheap, and safe to call on every render path. */
export async function remindersEnabled(): Promise<boolean> {
  if (pushAvailability().kind !== 'ready') return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}
