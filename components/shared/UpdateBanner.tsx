'use client';
import { useState } from 'react';
import { applyUpdate } from '@/lib/serviceWorker';

/**
 * "A new version is ready." The one affordance that keeps a cached shell from outliving its data.
 *
 * ── IT IS NOT A TOAST, AND THAT IS THE WHOLE REASON IT IS A SEPARATE COMPONENT ──
 *
 * `ToastHost` is two sentence-long receipts for things that have already happened, and its own
 * docstring says why they behave as they do: "Auto-dismissing, because neither is an action —
 * they are receipts." An available update is the opposite. It is an ACTION, the learner is the
 * only one who can take it, and a notice that disappears after 2.6 seconds is a notice that will
 * be missed on the one load where it mattered.
 *
 * Why it matters at all: public/sw.js deliberately does not `skipWaiting`, so a new worker waits
 * rather than swapping chunks under a page mid-session. That is the right trade, and it means the
 * ONLY route from an old shell to a new one is this button. A stale shell outliving a schema
 * change is the worst version of the stale-artefact bug CLAUDE.md records — it is silent, it
 * persists across reloads, and it is most dangerous precisely when the data model has moved.
 *
 * ── DISMISSIBLE, BUT THE UPDATE IS NOT CANCELLED ──
 *
 * Dismiss hides the banner for this page view. It does not tell the worker to go away, so the
 * update still applies on the next natural reload — which is the honest behaviour: a learner
 * mid-passage should be able to make the thing go away without being asked to make a decision
 * about build artefacts.
 *
 * ── BOTTOM LEFT, AND ABOVE THE TOASTS, WHICH IS A PHONE PROBLEM ──
 *
 * `ToastHost` is bottom right at `maxWidth: 320`, and this is bottom left at the same width.
 * On a desktop they sit side by side. On a 375px phone they cannot: measured, this occupies
 * x 18–338 and a toast would occupy x 37–357, both anchored at `bottom: 18`. So a milestone
 * toast lands squarely on the Reload button.
 *
 * `ToastHost` is `zIndex: 60`, so it would win — and it is the one that should lose. A toast is
 * a receipt that clears itself in 2.6–5.2 seconds; this is the only route from an old shell to
 * a new one and it stays until it is used. Hence 61.
 *
 * The width clamp does something smaller than it looks, and the first version of this comment
 * claimed more: `maxWidth: 320` does NOT overflow a 320px viewport, because the box simply
 * shrinks to the space `left: 18` leaves it. What it does is sit flush against the right edge —
 * measured at 320px, right edge 320 with no gutter at all, against an 18px gutter on the left.
 * The clamp restores the symmetry (width 284, both gutters 18). A gutter, not an overflow fix.
 */
export default function UpdateBanner({ ready }: { ready: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  if (!ready || dismissed) return null;

  const mono = { fontFamily: 'var(--f-mono)' } as const;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[11px] px-4 py-3 flex items-center gap-3"
      style={{
        position: 'fixed',
        left: 18,
        bottom: 18,
        // Above ToastHost's 60: an action the learner must be able to aim at outranks a
        // receipt that dismisses itself. See the docstring.
        zIndex: 61,
        maxWidth: 'min(320px, calc(100vw - 36px))',
        background: 'var(--card)',
        border: '1px solid var(--accent)',
        boxShadow: '0 6px 20px color-mix(in srgb, var(--ink) 12%, transparent)',
      }}
    >
      <div className="flex flex-col gap-0.5">
        <span style={{ ...mono, fontSize: 10, letterSpacing: '0.08em', color: 'var(--accent)' }}>
          UPDATE READY
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
          A newer version of srsly is waiting.
        </span>
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <button
          type="button"
          disabled={applying}
          onClick={() => { setApplying(true); applyUpdate(); }}
          className="rounded-[7px] px-2.5 py-1.5"
          style={{
            ...mono,
            fontSize: 11,
            cursor: applying ? 'default' : 'pointer',
            background: 'var(--accent)',
            color: 'var(--paper)',
            border: '1px solid var(--accent)',
            opacity: applying ? 0.6 : 1,
          }}
        >
          {applying ? '…' : 'Reload'}
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="rounded-[7px] px-2 py-1.5"
          style={{
            ...mono,
            fontSize: 11,
            cursor: 'pointer',
            background: 'transparent',
            color: 'var(--ink-soft)',
            border: '1px solid var(--line)',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
