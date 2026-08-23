'use client';
import { useEffect, useState } from 'react';
import { bookmarkletSource } from '@/lib/webClip';

/**
 * Install the one-click web clipper.
 *
 * A bookmarklet cannot be installed by a button — the browser only accepts one by being
 * dragged to the bookmarks bar, or copied and pasted into a new bookmark by hand. So this
 * panel's job is to make that unavoidable manual step short and obvious, and to give a
 * copy fallback for the browsers and platforms where dragging is awkward.
 *
 * The `href` is built from `window.location.origin`, so the link a reader drags points at
 * whatever host they are actually using — localhost while developing, the real domain in
 * production. Hardcoding it would produce a bookmark that silently opens the wrong site.
 */

const mono = { fontFamily: 'var(--f-mono)' } as const;

export default function ClipperPanel() {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  // Origin is only known in the browser; rendering it on the server would produce a link
  // pointing at the wrong host, or a hydration mismatch.
  useEffect(() => { setOrigin(window.location.origin); }, []);

  if (!origin) return null;
  const src = bookmarkletSource(origin);

  async function copy() {
    try {
      await navigator.clipboard.writeText(src);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the drag target is still there */ }
  }

  return (
    <div className="mb-8">
      <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
        Web clipper
      </div>

      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '52ch', lineHeight: 1.55, marginBottom: 14 }}>
        Reading a Spanish blog or a Chinese article somewhere else? Click this from any page and
        it opens here, segmented and ready to mine. Drag it to your bookmarks bar — a browser
        will not let a page install a bookmark for you.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <a
          /**
           * The href is set through the DOM, not as a React prop.
           *
           * React refuses to render a `javascript:` URL in an href — it substitutes a throwing
           * stub, which is the right default for user-supplied links and exactly wrong for a
           * bookmarklet, whose entire nature is being a `javascript:` URL the reader drags to
           * their toolbar. Assigning the attribute directly is the standard way out, and is
           * safe here because the source is ours and built at render time, never user input.
           *
           * The panel looked correct with the React prop in place; only the dragged bookmark
           * was dead, which is the kind of thing that has to be clicked to be noticed.
           */
          ref={el => { if (el) el.setAttribute('href', src); }}
          onClick={e => e.preventDefault()}
          draggable
          title="Drag me to your bookmarks bar"
          className="cursor-grab"
          style={{
            ...mono, fontSize: 12, letterSpacing: '.06em', textDecoration: 'none',
            background: 'var(--accent)', color: '#fff', borderRadius: 8,
            padding: '10px 16px', display: 'inline-block',
          }}
        >
          ✂ Clip to srsly
        </a>

        <button
          onClick={copy}
          className="cursor-pointer"
          style={{ ...mono, fontSize: 11.5, background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 13px', color: 'var(--ink-soft)' }}
        >
          {copied ? '✓ Copied' : 'Copy as text'}
        </button>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', maxWidth: '52ch', lineHeight: 1.55, marginTop: 12 }}>
        Select part of a page first to clip just that; otherwise it takes the article. The text
        travels in the link itself and is <strong style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>never
        sent to a server</strong> — same as pasting it in by hand.
      </p>
    </div>
  );
}
