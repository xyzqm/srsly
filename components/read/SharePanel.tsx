'use client';
import { useEffect, useState } from 'react';
import { buildShareUrl } from '@/lib/shareLink';

/**
 * Hand somebody the thing you are reading.
 *
 * ## IT SAYS WHAT TRAVELS, AND THAT IS THE POINT OF THE PANEL EXISTING
 *
 * `ReadTab` clears the clip hash partly because "an 8,000-character fragment sitting in the
 * address bar is something the reader might copy and share without realising what is in it." A
 * share button is that same act made deliberate, so the one thing this panel must not do is stay
 * quiet about it. srsly's server genuinely never sees the text — a fragment is not sent with the
 * request — but the app you paste the link into does, and a promise that quietly stops holding is
 * worse than one that was never made. So the sentence is on screen next to the button, not in a
 * tooltip and not in a doc.
 *
 * ## THE LINK IS BUILT ON OPEN, NOT ON COPY
 *
 * Encoding is async (see `lib/shareLink.ts`), and a Copy button whose first press has to wait for
 * a codec is a button that feels broken on the press that matters. Opening the panel is the
 * affordance that can afford to take a moment, so the work happens there and Copy is instant.
 *
 * The length is shown because it is the one honest measure of what is being sent, and because it
 * is the number the whole v2 codec exists to move.
 */
interface Props {
  title: string;
  text: string;
  /** A raw tag, as `WebClip.lang` is — the recipient's `languageFromTag` decides what it means. */
  lang: string;
}

const mono = { fontFamily: 'var(--f-mono)' } as const;

export default function SharePanel({ title, text, lang }: Props) {
  /** `undefined` = still building, `null` = it could not be built. Two different sentences, and
   *  rendering the second while the first is true is the mistake this codebase names four times. */
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    const base = window.location.origin + window.location.pathname;
    buildShareUrl(base, { title, text, lang })
      .then(u => { if (live) setUrl(u); })
      .catch(() => { if (live) setUrl(null); });
    return () => { live = false; };
  }, [title, text, lang]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_200);
    } catch {
      // Clipboard access can be refused outright (no permission, an insecure origin, an older
      // browser). Selecting the field is then the only way left, so it stays on screen and
      // readable rather than being replaced by a success message that did not happen.
      setCopied(false);
    }
  }

  return (
    <div
      className="rounded-[11px] px-5 py-4 mb-4"
      style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
    >
      <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        Share this reading
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.55, margin: '6px 0 10px', maxWidth: '58ch' }}>
        The whole text rides <em>inside</em> the link — there is nothing stored and no page to
        expire. srsly&apos;s server never receives it.{' '}
        <span style={{ color: 'var(--ink-faint)' }}>
          Whatever you paste the link into will, though, so send it the way you would send the
          article itself.
        </span>
      </p>
      <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', lineHeight: 1.55, margin: '0 0 12px', maxWidth: '58ch' }}>
        They will read it at <em>their</em> level, with <em>their</em> own words marked — no
        blanks and nothing scheduled, because this is reading rather than an exercise.
      </p>

      {url === undefined && (
        <div style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)' }}>building the link…</div>
      )}

      {url === null && (
        <div style={{ ...mono, fontSize: 11, color: 'var(--ink-soft)' }}>
          The link could not be built on this browser. Copying the text by hand still works.
        </div>
      )}

      {url && (
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={copy}
            className="cursor-pointer"
            style={{
              ...mono, fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase',
              background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8,
              padding: '7px 13px', color: 'var(--ink)',
            }}
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <input
            readOnly
            value={url}
            onFocus={e => e.currentTarget.select()}
            style={{
              ...mono, fontSize: 11, flex: '1 1 14rem', minWidth: '10rem',
              background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8,
              padding: '7px 10px', color: 'var(--ink-faint)',
            }}
          />
          <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)' }}>
            {url.length.toLocaleString()} chars
          </span>
        </div>
      )}
    </div>
  );
}
