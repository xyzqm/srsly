'use client';
import { useCallback, useState } from 'react';
import type { DeckWord, DailyPassage, LanguageCode } from '@/lib/types';
import { buildPastedPassage, type RawTok } from '@/hooks/useDailyContent';
import { selectClozeTargets } from '@/lib/clozeTargets';
import { getSrsSettings } from '@/lib/fsrs';
import { getTodayCounts } from '@/lib/reviewCounts';
import { starterTexts, type StarterText } from '@/lib/data/starterTexts';

/**
 * Three short texts, ready to read, for the first visit.
 *
 * Goes through `/api/segment-text` exactly as pasted text does — no special path, no
 * pre-tokenised fixture. A starter text IS a pasted text that happens to ship with the app,
 * so it gets the same segmenter, the same dictionary lookups, the same blanks and the same
 * word popups. If it rendered differently from a pasted article, the first thing a learner
 * met would be unrepresentative of everything after it.
 *
 * No analysis or coverage step either. Paste has one because you are handing over unknown
 * material and deserve to be told it is too hard; these are known to be level-appropriate and
 * every word is checked against the dictionary in tests/starterTexts.test.ts. One tap should
 * put text on screen.
 */

interface Props {
  language: LanguageCode;
  deck: DeckWord[];
  dueWords: Set<string>;
  blankDensity?: number;
  onCommit: (passage: DailyPassage) => void;
}

const mono = { fontFamily: 'var(--f-mono)' } as const;

export default function StarterPanel({ language, deck, dueWords, blankDensity, onCommit }: Props) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const texts = starterTexts(language);

  const open = useCallback(async (t: StarterText) => {
    setBusy(t.id);
    setError('');
    try {
      const res = await fetch('/api/segment-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: t.text,
          title: t.title,
          language,
          words: deck.map(w => ({ h: w.h, p: w.p, m: w.m })),
          names: [],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      const raw = await res.json() as { title: RawTok[]; sentences: RawTok[][] };
      const built = buildPastedPassage(raw, deck, language, []);
      const targets = selectClozeTargets(
        built.sentences, deck, dueWords, blankDensity,
        getSrsSettings().newPerDay - getTodayCounts().newCount,
      );
      onCommit({ ...built, vocabWords: [...targets.words] });
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy('');
    }
  }, [language, deck, dueWords, blankDensity, onCommit]);

  if (texts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {texts.map(t => (
        <button
          key={t.id}
          onClick={() => void open(t)}
          disabled={!!busy}
          className="cursor-pointer transition-all duration-150 text-left disabled:opacity-50 disabled:cursor-default"
          style={{
            background: 'var(--paper-2)', border: '1px solid var(--line)',
            borderRadius: 11, padding: '13px 15px',
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span style={{ fontFamily: 'var(--f-han)', fontSize: 15, color: 'var(--ink)', fontWeight: 500 }}>
              {t.title}
            </span>
            {busy === t.id && (
              <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)' }}>opening…</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.45 }}>
            {t.blurb}
          </div>
        </button>
      ))}
      {error && (
        <p style={{ ...mono, fontSize: 11.5, color: 'var(--wrong)' }}>{error}</p>
      )}
    </div>
  );
}
