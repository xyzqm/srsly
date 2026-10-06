'use client';
import { useEffect, useState } from 'react';
import {
  loadUserKey, loadProvider, saveUserKey, clearUserKey, looksLikeProviderKey, maskKey,
  AI_PROVIDERS, type ProviderId,
} from '@/lib/userApiKey';
import { providerOrDefault, providerForKey } from '@/lib/aiProviders';

/**
 * Connect a key, from whichever of the three services you like.
 *
 * srsly is free to run and free to use. The only thing that costs anything is having a passage
 * WRITTEN, so that one feature is bring-your-own-key — and for a long time that meant bring
 * your own ANTHROPIC key, which is about a cent a passage and requires a card on file. "Free,
 * as long as you can pay Anthropic" is not free to a student without one, and this app is for
 * students.
 *
 * **GOOGLE AND GROQ BOTH HAVE A REAL FREE TIER**, rate-limited rather than trial-limited, so
 * the honest answer to "can this be free?" is now yes: sign up, copy a key, paste it, and
 * generate at no cost to the learner and none to the operator. That is why the picker leads
 * with which options are free rather than burying it in the blurb.
 *
 * Three things this copy is deliberate about, because each is easy and expensive to get wrong:
 *
 * - **What still works without any key, stated first.** Someone who reads "you need an API
 *   key" and stops has been told the app is paid, which is false — reading your own text, a
 *   book or audio needs nothing, and that is most of the app.
 * - **A free tier is a RATE LIMIT, not an unlimited supply.** Saying "free" and meaning
 *   "free until it stops working this afternoon with an error you cannot interpret" is the
 *   kind of half-truth this codebase refuses. The limit is named here and the rate-limit
 *   error names it again at the moment it bites.
 * - **Use a dedicated key with a spend limit.** The key is kept in this browser's
 *   localStorage, which any script on the page could read. srsly loads no third-party
 *   JavaScript, but the right advice is still a scoped key. That matters less on a free tier
 *   and is still given: a leaked key is somebody else's rate limit to burn.
 *
 * **ANTHROPIC STAYS THE DEFAULT**, which is a quality judgement rather than inertia. Every
 * prompt in this app was written and measured against Haiku; the free two are offered because
 * they cost nothing, not because they are better. See lib/aiProviders.ts.
 */

const mono = { fontFamily: 'var(--f-mono)' } as const;

interface Props {
  /**
   * Fired after the connected key changes, so a summary elsewhere on the screen can re-read it.
   *
   * `AccountPanel` shows the same key as a status line and reads it once on mount, which made
   * the two disagree for as long as the learner stayed on the page: connect a key here and the
   * overview an inch above still said "No key". They read one source, which is what stops them
   * ever being WRONG — but reading it at two different times is enough to be inconsistent, and
   * an overview contradicting the panel under it is indistinguishable from a broken save.
   */
  onKeyChange?: () => void;
}

export default function ApiKeyPanel({ onKeyChange }: Props) {
  const [stored, setStored] = useState('');
  const [storedProvider, setStoredProvider] = useState<ProviderId>('anthropic');
  /** Which provider the picker is pointed at — the stored one until the learner moves it. */
  const [picked, setPicked] = useState<ProviderId>('anthropic');
  /**
   * ⚠ ONE DRAFT PER PROVIDER, because one shared draft was WIPED on every tab click.
   *
   * The picker's handler called `setDraft('')`, so pasting a Groq key, glancing at Gemini and
   * coming back lost the paste — and an API key is the single most annoying thing in this app
   * to re-fetch, because it lives in another tab on another site behind a login. Reported as
   * "I have to re-enter it every time I switch tabs".
   *
   * Keyed by provider rather than cleared, so moving between the three is free and nothing is
   * typed twice. Cleared on save and on cancel, which are the two places a draft is finished
   * with.
   */
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  /**
   * MASK WITHOUT BEING A PASSWORD FIELD, WHERE THE BROWSER LETS US.
   *
   * The field was `type="password"` with `autoComplete="off"`, and that combination does not
   * do what it looks like it does: Chrome and Safari deliberately IGNORE `autocomplete="off"`
   * on password inputs, because sites used it to block password managers and users lost
   * passwords. So pasting an API key raised the browser's own credential popup — reported from
   * a phone as a panel that "covers the top nav tabs" — and offered to save a Groq token as a
   * website password, which is also where it does not belong.
   *
   * `-webkit-text-security: disc` gives the dots without the semantics. It is supported by
   * every WebKit and Chromium browser, which is iOS Safari, Chrome, Edge and Android — all of
   * the platforms this was reported on. Firefox does not implement it, so there the field
   * stays a real password input and keeps its masking; Firefox's manager is also the one that
   * does not pop over the page for a field outside a `<form>`, and this one is outside a form.
   *
   * Detected AFTER mount rather than during render, deliberately. `CSS.supports` does not
   * exist on the server, so deciding this in a `useState` initialiser would render `password`
   * on the server and `text` on the client and fail hydration on the `type` attribute. Both
   * sides start masked the safe way and the swap happens in the first effect, long before
   * anybody can focus the field.
   */
  const [softMask, setSoftMask] = useState(false);
  useEffect(() => {
    try {
      if (typeof CSS !== 'undefined' && CSS.supports?.('-webkit-text-security', 'disc')) {
        setSoftMask(true);
      }
    } catch { /* no CSS.supports — stay a password field */ }
  }, []);

  useEffect(() => {
    const k = loadUserKey();
    const p = loadProvider();
    setStored(k);
    setStoredProvider(p);
    setPicked(p);
  }, []);

  const provider = providerOrDefault(picked);
  const draft = drafts[picked] ?? '';
  const setDraft = (v: string) => setDrafts(d => ({ ...d, [picked]: v }));
  /**
   * The connected row shows only when the picker is still pointed at the key that is actually
   * connected. Moving it elsewhere opens the field for THAT service without disconnecting
   * anything — the old key keeps working until a new one is saved, so browsing the options is
   * not a way to accidentally sign yourself out of generation.
   */
  const showConnected = !!stored && picked === storedProvider && !editing;

  function save() {
    const v = draft.trim();
    if (!looksLikeProviderKey(picked, v)) {
      // Name the service the key DOES look like. "That is a Groq key, and this is the Gemini
      // field" is a fix; "invalid key" is a guessing game the picker just made possible.
      const actual = providerForKey(v);
      setError(actual && actual.id !== picked
        ? `That key belongs to ${actual.name}. Pick ${actual.name} above, or paste a key from ${provider.name}.`
        // Every live prefix, not just one: Google issues both `AQ.` and `AIza`, and naming a
        // single format tells half of them their working key is malformed.
        : `That does not look like a key from ${provider.name} — theirs start with ${provider.keyPrefixes.map(p => `“${p}”`).join(' or ')}.`);
      return;
    }
    saveUserKey(v, picked);
    setStored(v);
    setStoredProvider(picked);
    setDraft('');
    setEditing(false);
    setError('');
    onKeyChange?.();
  }

  function remove() {
    clearUserKey();
    setStored('');
    setDraft('');
    setEditing(false);
    setError('');
    onKeyChange?.();
  }

  return (
    <div className="mb-8">
      <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
        AI passages
      </div>

      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '54ch', lineHeight: 1.55, marginBottom: 6 }}>
        Everything in srsly works without this — your own text, EPUB books, audio, the whole
        review system, every dictionary. A key is only needed to have a <em>new</em> passage
        written around your due words.
      </p>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '54ch', lineHeight: 1.55, marginBottom: 14 }}>
        <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>Two of the three are free.</strong>{' '}
        Google and Groq both give out keys at no cost — no card, no bill, just a cap on how many
        requests you can make in a stretch. Anthropic charges you about a cent a passage and is
        what these prompts were written against.
      </p>

      {/* ── Provider ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 mb-4" style={{ maxWidth: 520 }}>
        {AI_PROVIDERS.map(p => {
          const on = p.id === picked;
          const connected = !!stored && p.id === storedProvider;
          return (
            <button
              key={p.id}
              onClick={() => { setPicked(p.id); setError(''); }}
              className="text-left cursor-pointer transition-all duration-150 rounded-[10px] px-4 py-3"
              style={{
                background: on ? 'color-mix(in srgb, var(--accent) 8%, var(--card))' : 'var(--card)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
              }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontFamily: 'var(--f-display)', fontSize: 15, color: on ? 'var(--accent)' : 'var(--ink)' }}>
                  {p.name}
                </span>
                {p.freeTier && (
                  <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--jade)', border: '1px solid color-mix(in srgb, var(--jade) 45%, transparent)', borderRadius: 5, padding: '2px 6px' }}>
                    free tier
                  </span>
                )}
                {connected && (
                  <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                    connected
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.45 }}>
                {p.blurb}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Key ───────────────────────────────────────────────────────────── */}
      {showConnected ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="rounded-lg px-3 py-2"
            style={{ ...mono, fontSize: 12.5, background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
          >
            {maskKey(stored, storedProvider)}
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--jade)' }}>
            Connected to {providerOrDefault(storedProvider).name}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="cursor-pointer"
            style={{ ...mono, fontSize: 11.5, background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 12px', color: 'var(--ink-soft)' }}
          >
            Replace
          </button>
          <button
            onClick={remove}
            className="cursor-pointer"
            style={{ ...mono, fontSize: 11.5, background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 12px', color: 'var(--wrong)' }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2" style={{ maxWidth: 480 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type={softMask ? 'text' : 'password'}
              value={draft}
              onChange={e => { setDraft(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              placeholder={provider.keyPlaceholder}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
              /* The three vendor opt-outs, for the managers that are not the browser's own.
                 1Password, Bitwarden/LastPass and Dashlane each read their own attribute and
                 each honours it; there is no standard one to use instead. A key is not a
                 credential for THIS site, so none of them has anything useful to offer here. */
              data-1p-ignore=""
              data-lpignore="true"
              data-form-type="other"
              className="rounded-lg px-3 py-2"
              style={{
                ...mono, fontSize: 12.5, flex: '1 1 240px', background: 'var(--paper-2)',
                border: '1px solid var(--line)', color: 'var(--ink)',
                ...(softMask ? { WebkitTextSecurity: 'disc' } as React.CSSProperties : {}),
              }}
            />
            <button
              onClick={save}
              disabled={!draft.trim()}
              className="cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ ...mono, fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px' }}
            >
              Connect
            </button>
            {stored && (
              <button
                onClick={() => { setEditing(false); setDraft(''); setError(''); setPicked(storedProvider); }}
                className="cursor-pointer"
                style={{ ...mono, fontSize: 11.5, background: 'none', border: 'none', color: 'var(--ink-faint)' }}
              >
                cancel
              </button>
            )}
          </div>
          {error && <p style={{ ...mono, fontSize: 11.5, color: 'var(--wrong)', lineHeight: 1.5 }}>{error}</p>}
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
            Get a {provider.freeTier ? 'free ' : ''}key from {provider.name} at{' '}
            <a
              href={provider.consoleUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: 'var(--ink-soft)', textDecoration: 'underline' }}
            >
              {provider.consoleLabel}
            </a>.
          </p>
        </div>
      )}

      <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', maxWidth: '54ch', lineHeight: 1.55, marginTop: 12 }}>
        Kept in this browser only — never sent anywhere except with your own generation
        requests, and never stored on a server. Use a{' '}
        <strong style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>dedicated key with a spend limit</strong>{' '}
        rather than your main one: anything with access to this browser can read it. On a free
        tier there is no bill to run up, but a leaked key is still someone else&apos;s quota to
        burn.
      </p>
    </div>
  );
}
