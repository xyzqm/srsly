'use client';

/**
 * THE BOUNDARY OF LAST RESORT: a throw in the ROOT LAYOUT itself.
 *
 * `app/error.tsx` is rendered INSIDE the root layout, so it cannot catch an error thrown by
 * that layout — React has no tree left to put it in. This one REPLACES the document, which is
 * why it renders its own `<html>` and `<body>`: without them the page has no root element and
 * Next's own fallback (a bare "Application error" string) is what the learner gets.
 *
 * ── IT IS DELIBERATELY ALMOST UNREACHABLE, AND STILL WORTH THE THIRTY LINES ──
 * `app/layout.tsx` is a server component that renders static metadata, two `<link>`s and one
 * inline script, with no data fetching and no hooks — so there is very little there to throw.
 * That is exactly why this file is small and self-contained rather than sharing anything with
 * its sibling: a boundary that imports a module is a boundary that can fail for the same
 * reason the page did.
 *
 * ── NO THEME VARIABLES, BECAUSE THE DOCUMENT THEY LIVE ON IS WHAT FAILED ──
 * Everything else in this app is styled from the CSS custom properties in `globals.css`, and
 * this is the one file that must not be: it replaces `<body>`, so the pre-paint script that
 * sets `data-theme` has not run and the variables may be undefined. Undefined custom
 * properties resolve to nothing, which here would mean invisible text on an invisible
 * background — the white screen this exists to prevent, wearing a stylesheet. The colours are
 * therefore literal, and they are the `paper` theme's own values so it still looks like srsly.
 * `app/globals.css` carries the one other deliberate exception to that rule, for print.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#FBF8F1', color: '#2A2520', minHeight: '100vh' }}>
        <div style={{ maxWidth: 440, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 46, color: '#B9AE9C', lineHeight: 1 }}>?</div>
          <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 24, fontWeight: 500, margin: '14px 0 0' }}>
            srsly couldn’t start.
          </h1>
          <p style={{ color: '#6B6256', lineHeight: 1.65, margin: '10px 0 0' }}>
            Your words and progress are saved on this device and are not affected.
          </p>
          <button
            onClick={reset}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
              marginTop: 26, padding: '12px 22px', borderRadius: 9, cursor: 'pointer',
              background: 'rgba(178,58,46,.12)', border: '1px solid #B23A2E', color: '#B23A2E',
            }}
          >
            Try again
          </button>
          {error?.digest && (
            <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 9.5, color: '#B9AE9C', letterSpacing: '.08em', marginTop: 30 }}>
              {error.digest}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
