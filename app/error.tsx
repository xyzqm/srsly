'use client';
import { useEffect, useState } from 'react';

/**
 * THE WHITE SCREEN. Until this file existed there was no error boundary anywhere in the app.
 *
 * ── WHY IT MATTERS MORE HERE THAN IN A TYPICAL APP ──
 * `app/page.tsx` is ONE client component rendering every tab, and `components/TabPanel.tsx`
 * keeps each of them mounted once visited. So a throw while rendering any tab unmounts the
 * whole tree — not that tab, the app — and in production Next ships no overlay, so what the
 * learner sees is a blank page. Nothing in the console they would ever open, nothing to press.
 *
 * It was found while diagnosing "sometimes when I load in it doesn't load so I have to reload".
 * That turned out to be a 12.9-second first paint and not a throw at all (see the font section
 * in CLAUDE.md), and the gap is recorded because it would make exactly that report
 * indistinguishable from this one: both look like a page that never arrived.
 *
 * ── TWO BUTTONS, BECAUSE `reset()` CANNOT FIX THE COMMONEST PRODUCTION ERROR ──
 * `reset()` re-renders the same tree from the same already-loaded modules. That is the right
 * first try for a transient throw — a bad value from storage, a race — and it is useless
 * against the single most common React error in production, a failed dynamic `import()` after a
 * deploy: the module graph is still broken, so re-rendering throws again instantly. A full
 * reload refetches the document and can recover. Offering only one of the two would strand
 * half the cases, and offering them unlabelled would be two buttons that look like the same
 * button, so they say what they each do.
 *
 * ── THE THIRD BUTTON IS DESTRUCTIVE AND IS THEREFORE EARNED, NOT OFFERED ──
 * A service worker outlives the deploy that shipped it, so a genuinely bad cached shell
 * survives reloads — which is why `lib/serviceWorker.ts` exports `unregisterServiceWorker` as
 * a deliberate kill switch rather than leaving DevTools as the only route out. It appears only
 * after a reload has already been tried and failed, because it is the heaviest hammer here and
 * a learner reaching for it first would clear their offline app shell over a transient blip.
 * It touches no learner data: decks, prefs and the write queue are in localStorage and
 * IndexedDB, which unregistering a worker does not go near.
 *
 * ── IT SHOWS THE DIGEST AND NOT THE STACK ──
 * `error.digest` is the hash Next puts in the server log for the same error, so it is the one
 * string that makes a report actionable. A stack trace is noise to a learner and, on a server
 * component error, Next deliberately withholds the message anyway. The sentence above it does
 * not guess at a cause: this boundary cannot know one, and "check your connection" would be a
 * confident wrong answer of exactly the kind this project refuses elsewhere.
 *
 * ── NO `useTheme`, DELIBERATELY ──
 * Theme and font are already on `<body>` from the pre-paint script in `app/layout.tsx`, which
 * runs before this and survives the error. Calling the hook here would load the cosmetics
 * catalogue inside a boundary whose whole job is to work when something else did not.
 */

const mono = { fontFamily: 'var(--f-mono)' } as const;

const button = (strong: boolean) => ({
  ...mono,
  fontSize: 12,
  letterSpacing: '.1em',
  textTransform: 'uppercase' as const,
  cursor: 'pointer',
  borderRadius: 9,
  padding: '12px 22px',
  background: strong ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
  border: `1px solid ${strong ? 'var(--accent)' : 'var(--line)'}`,
  color: strong ? 'var(--accent)' : 'var(--ink-soft)',
});

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloaded, setReloaded] = useState(false);
  const [clearing, setClearing] = useState(false);

  /**
   * Remembered across the reload, so the heavier option is offered only once a reload has
   * already failed. `sessionStorage` rather than `localStorage`: a reload is part of THIS
   * attempt to get the app open, and a learner returning next week should meet the ordinary
   * two buttons rather than a page still assuming the last session went badly. Wrapped,
   * because a blocked or full store must not throw inside the error boundary itself — which
   * would be a boundary that fails the way the thing it is catching did.
   */
  useEffect(() => {
    try {
      if (sessionStorage.getItem('srsly-error-reloaded') === '1') setReloaded(true);
      sessionStorage.setItem('srsly-error-reloaded', '1');
    } catch { /* private mode, or storage blocked */ }
    // Logged so a learner who reports this has something to quote, and so the digest is
    // greppable in a browser log. It is the only place the raw error is surfaced at all.
    console.error('[srsly] render error', error?.digest ?? '', error);
  }, [error]);

  const hardReload = () => {
    try { sessionStorage.setItem('srsly-error-reloaded', '1'); } catch { /* ignore */ }
    window.location.reload();
  };

  const clearShell = async () => {
    setClearing(true);
    try {
      const { unregisterServiceWorker } = await import('@/lib/serviceWorker');
      await unregisterServiceWorker();
    } catch { /* nothing registered, or no support — reloading is still worth a try */ }
    try { sessionStorage.removeItem('srsly-error-reloaded'); } catch { /* ignore */ }
    window.location.reload();
  };

  return (
    <div className="text-center px-4" style={{ paddingTop: 72, paddingBottom: 72 }}>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 46, color: 'var(--ink-faint)', lineHeight: 1 }}>
        {/* The app's own wordmark character rather than a warning triangle: an error screen is
            still srsly, and a ⚠ in the display serif reads as somebody else's dialog box. */}
        ?
      </div>
      <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 500, marginTop: 14 }}>
        Something broke while drawing this page.
      </h1>
      <p style={{ color: 'var(--ink-soft)', margin: '10px auto 0', maxWidth: '42ch', lineHeight: 1.65 }}>
        Your words, progress and settings are stored on this device and are not affected — this
        went wrong on the way to the screen, not in your deck.
      </p>

      <div className="flex items-center justify-center gap-2 flex-wrap" style={{ marginTop: 26 }}>
        <button onClick={reset} style={button(true)} className="transition-all duration-150">
          Try again
        </button>
        <button onClick={hardReload} style={button(false)} className="transition-all duration-150">
          Reload the page
        </button>
      </div>

      {reloaded && (
        /* Only after a reload has already been tried and not helped. See the docstring: a
           stale cached app shell survives reloads by design, so this is the route out that
           does not require DevTools. */
        <div style={{ marginTop: 22 }}>
          <button
            onClick={clearShell}
            disabled={clearing}
            style={{ ...button(false), opacity: clearing ? 0.5 : 1, cursor: clearing ? 'default' : 'pointer' }}
            className="transition-all duration-150"
          >
            {clearing ? 'Clearing…' : 'Still broken — clear the offline copy'}
          </button>
          <div style={{ ...mono, fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.04em', marginTop: 10, maxWidth: '34ch', marginInline: 'auto', lineHeight: 1.6 }}>
            Discards the saved copy of the app and fetches it again. Keeps your deck.
          </div>
        </div>
      )}

      {error?.digest && (
        <div style={{ ...mono, fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.08em', marginTop: 30, opacity: 0.8 }}>
          {error.digest}
        </div>
      )}
    </div>
  );
}
