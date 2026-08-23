'use client';
import { useEffect, useState } from 'react';
import {
  loadUserKey, saveUserKey, clearUserKey, looksLikeAnthropicKey, maskKey,
} from '@/lib/userApiKey';

/**
 * Connect your own Anthropic key.
 *
 * srsly is free to run and free to use. The only thing that costs money is having a passage
 * written for you, so that one feature is bring-your-own-key: the learner pays Anthropic
 * directly, about a cent a passage, and nothing routes through anyone else's bill.
 *
 * The copy below is deliberate about two things, because both are easy to get wrong and
 * expensive to get wrong:
 *
 * - **What still works without a key**, stated first. Someone who reads "you need an API key"
 *   and stops has been told the app is paid, which is false — reading your own text, a book
 *   or audio needs nothing, and that is most of the app.
 * - **Use a dedicated key with a spend limit.** The key is kept in this browser's
 *   localStorage, which any script on the page could read. srsly loads no third-party
 *   JavaScript, but the right advice is still a scoped key rather than a primary one.
 */

const mono = { fontFamily: 'var(--f-mono)' } as const;

export default function ApiKeyPanel() {
  const [stored, setStored] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setStored(loadUserKey()); }, []);

  function save() {
    const v = draft.trim();
    if (!looksLikeAnthropicKey(v)) {
      setError('That does not look like an Anthropic key — they start with “sk-ant-”.');
      return;
    }
    saveUserKey(v);
    setStored(v);
    setDraft('');
    setEditing(false);
    setError('');
  }

  function remove() {
    clearUserKey();
    setStored('');
    setDraft('');
    setEditing(false);
    setError('');
  }

  return (
    <div className="mb-8">
      <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
        AI passages
      </div>

      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '52ch', lineHeight: 1.55, marginBottom: 12 }}>
        Everything in srsly works without this — your own text, EPUB books, audio, the whole
        review system, every dictionary. A key is only needed to have a <em>new</em> passage
        written around your due words. You pay Anthropic directly, around a cent a passage.
      </p>

      {stored && !editing ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="rounded-lg px-3 py-2"
            style={{ ...mono, fontSize: 12.5, background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
          >
            {maskKey(stored)}
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--ok, var(--accent))' }}>Connected</span>
          <button
            onClick={() => { setEditing(true); setDraft(''); }}
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
        <div className="flex flex-col gap-2" style={{ maxWidth: 460 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="password"
              value={draft}
              onChange={e => { setDraft(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              placeholder="sk-ant-…"
              spellCheck={false}
              autoComplete="off"
              className="rounded-lg px-3 py-2"
              style={{ ...mono, fontSize: 12.5, flex: '1 1 240px', background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
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
                onClick={() => { setEditing(false); setDraft(''); setError(''); }}
                className="cursor-pointer"
                style={{ ...mono, fontSize: 11.5, background: 'none', border: 'none', color: 'var(--ink-faint)' }}
              >
                cancel
              </button>
            )}
          </div>
          {error && <p style={{ ...mono, fontSize: 11.5, color: 'var(--wrong)' }}>{error}</p>}
        </div>
      )}

      <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', maxWidth: '52ch', lineHeight: 1.55, marginTop: 12 }}>
        Kept in this browser only — never sent anywhere except with your own generation
        requests, and never stored on a server. Use a{' '}
        <strong style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>dedicated key with a spend limit</strong>{' '}
        rather than your main one: anything with access to this browser can read it. Create one
        at console.anthropic.com → API keys.
      </p>
    </div>
  );
}
