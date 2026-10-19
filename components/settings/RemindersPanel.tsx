'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  pushAvailability, enableReminders, disableReminders, remindersEnabled,
  isApple, isInstalled, type PushAvailability,
} from '@/lib/push';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * Daily reminders, and the three different sentences this screen has to be able to say.
 *
 * ## WHY IT IS NOT ONE TOGGLE
 *
 * A switch implies the only two states are on and off. There are at least five, and four of
 * them are not the learner's fault:
 *
 *   - the deployment has no VAPID key, so nothing could ever be sent;
 *   - the browser has no Push API at all;
 *   - **the browser has one, but only once the app is on the Home Screen** (iOS);
 *   - permission was DENIED, which a button cannot undo — only site settings can;
 *   - it is simply off.
 *
 * Rendering any of the first four as an unchecked switch is this repo's most-repeated bug: a
 * value meaning "not possible here" shown as a value meaning "not turned on". The learner taps
 * it, nothing happens, and the feature reads as broken rather than unavailable.
 *
 * ## THE iOS CASE GETS INSTRUCTIONS, NOT AN APOLOGY
 *
 * Safari has supported Web Push since 16.4 for installed web apps only. In a tab `PushManager`
 * is absent — so this is the one unsupported state the learner can actually fix, and it is
 * told exactly how. That is the whole reason `pushAvailability` separates `needs-install` from
 * `unsupported` rather than collapsing them.
 *
 * ## NOTHING ABOUT THE REMINDER IS STORED ON THIS DEVICE
 *
 * The hour lives on the subscription row, because the SERVER is what has to know it. Reading
 * it back would mean a round trip to populate a select; instead the control shows what this
 * device last asked for, and re-enabling at a different hour simply upserts. The source of
 * truth is the row, and the row is written on every change.
 */

const MONO: React.CSSProperties = { fontFamily: 'var(--f-mono)', letterSpacing: '.08em' };

/** A short, sane list. A free-text hour is a new way to ask for 3am by accident. */
const HOURS = [7, 8, 9, 12, 17, 18, 19, 20, 21];

function label(h: number): string {
  const suffix = h < 12 ? 'am' : 'pm';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
}

export default function RemindersPanel() {
  const { signedIn } = useAuth();
  const [avail, setAvail] = useState<PushAvailability | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  const [hour, setHour] = useState(19);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Read in an effect rather than during render: every one of these touches `navigator` or
  // `Notification`, which do not exist on the server, and this tab is prerendered.
  useEffect(() => {
    setAvail(pushAvailability());
    void remindersEnabled().then(setOn);
  }, []);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    if (on) {
      const ok = await disableReminders();
      setOn(ok ? false : true);
      if (!ok) setNote('Could not turn them off — try again in a moment.');
    } else {
      const res = await enableReminders({ hourLocal: hour });
      setOn(res.ok);
      if (!res.ok) {
        setNote(
          res.reason === 'denied'
            // Permission is permanent until the learner changes it themselves. Offering the
            // button again would be a control that can never work.
            ? 'Your browser is blocking notifications for this site. Turn them back on in its site settings, then come back.'
            : res.reason === 'dismissed' ? 'No permission given, so nothing was set up.'
            : res.reason === 'unsupported' ? 'This browser cannot receive reminders.'
            : 'Something went wrong setting that up.',
        );
      }
    }
    setBusy(false);
  }, [busy, on, hour]);

  if (!avail) return null;   // first frame, before the browser has been asked anything

  if (avail.kind === 'not-configured') {
    return (
      <Box>
        <p style={body}>
          Reminders are not set up on this deployment. They need a push key on the server —
          see <code style={code}>scripts/gen-vapid.mjs</code>.
        </p>
      </Box>
    );
  }

  if (avail.kind === 'needs-install') {
    return (
      <Box>
        <p style={body}>
          {isApple() && !isInstalled()
            ? <>On iPhone and iPad, reminders work once srsly is on your Home Screen. Tap the
                share button, choose <strong>Add to Home Screen</strong>, then open srsly from
                there and come back to this screen.</>
            : <>Add srsly to your Home Screen, then open it from there to turn reminders on.</>}
        </p>
      </Box>
    );
  }

  if (avail.kind === 'unsupported') {
    return (
      <Box>
        <p style={body}>This browser cannot receive reminders. Everything else works as normal.</p>
      </Box>
    );
  }

  if (!signedIn) {
    // A reminder needs somewhere to come back to, and an anonymous session is discarded with
    // site data. Said plainly rather than by disabling a control with no explanation.
    return (
      <Box>
        <p style={body}>Sign in to get reminders — they are sent to your account, not to this browser alone.</p>
      </Box>
    );
  }

  return (
    <Box>
      <p style={body}>
        One notification a day, on this device, at the time you choose.
        {' '}<strong>It is skipped on any day you have already studied</strong> — so it only
        arrives when it is actually useful.
      </p>

      <div className="flex items-center gap-2.5 flex-wrap" style={{ marginTop: 14 }}>
        <button
          onClick={toggle}
          disabled={busy || on === null}
          className="rounded-lg transition-all duration-150"
          style={{
            ...MONO, fontSize: 11, padding: '10px 16px', fontWeight: 600, border: 'none',
            cursor: busy || on === null ? 'default' : 'pointer', opacity: busy ? .6 : 1,
            background: on ? 'var(--card)' : 'var(--jade)',
            color: on ? 'var(--ink-soft)' : '#fff',
            boxShadow: on ? 'inset 0 0 0 1px var(--line)' : 'none',
          }}
        >
          {on === null ? 'Checking…' : on ? 'Turn reminders off' : 'Turn reminders on'}
        </button>

        <label className="flex items-center gap-2" style={{ ...MONO, fontSize: 10.5, color: 'var(--ink-faint)' }}>
          at
          <select
            value={hour}
            onChange={async e => {
              const h = Number(e.target.value);
              setHour(h);
              // Already on? Re-register immediately. A time picker that only takes effect
              // after an off/on cycle is a control that silently does nothing.
              if (on) { setBusy(true); await enableReminders({ hourLocal: h }); setBusy(false); }
            }}
            className="rounded-md"
            style={{ ...MONO, fontSize: 11, padding: '5px 8px', background: 'var(--card)',
              border: '1px solid var(--line)', color: 'var(--ink)' }}
          >
            {HOURS.map(h => <option key={h} value={h}>{label(h)}</option>)}
          </select>
        </label>
      </div>

      {note && (
        <p style={{ ...body, marginTop: 10, color: 'var(--ink-soft)' }} role="status">{note}</p>
      )}
    </Box>
  );
}

const body: React.CSSProperties = {
  fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.55, margin: 0,
};
const code: React.CSSProperties = { fontFamily: 'var(--f-mono)', fontSize: 12 };

function Box({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 560 }}>{children}</div>;
}
