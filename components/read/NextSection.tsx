'use client';
import { useCallback, useEffect, useState } from 'react';
import type { DeckWord, DailyPassage, LanguageCode } from '@/lib/types';
import { getBook, savePosition, type StoredBook } from '@/lib/epubStore';
import { getActiveBookId, nextPosition, positionLabel, type Position } from '@/lib/epubProgress';
import { buildEpubSection } from '@/lib/epubSection';

/**
 * Carry on with the book, from the screen where you just finished a section.
 *
 * Going back through the library panel to advance one section is the papercut this removes —
 * and it was the single most-repeated action a book reader would perform. Rendered only when
 * a book is actually open, so it never appears for a generated passage or a pasted article.
 *
 * NOTHING IS RENDERED AT THE END OF A BOOK. A disabled button saying "Next section" is a
 * claim that there is one; `nextPosition` returning null means there is not, and the honest
 * answer is a line saying you have finished rather than a control you cannot press.
 */

interface Props {
  language: LanguageCode;
  deck: DeckWord[];
  dueWords: Set<string>;
  blankDensity?: number;
  onCommit: (passage: DailyPassage) => void;
}

const mono = { fontFamily: 'var(--f-mono)' as const };

export default function NextSection({ language, deck, dueWords, blankDensity, onCommit }: Props) {
  const [book, setBook] = useState<StoredBook | null>(null);
  const [next, setNext] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Re-read on every mount rather than holding state: the results screen appears after a
  // section is finished, which is exactly when the stored position has just changed.
  useEffect(() => {
    let live = true;
    const id = getActiveBookId(language);
    if (!id) { setBook(null); setNext(null); return; }
    void getBook(id).then(b => {
      if (!live || !b) return;
      setBook(b);
      const pos = b.position;
      setNext(pos ? nextPosition(b, pos.chapter, pos.section) : { chapter: 0, section: 0 });
    }).catch(() => { /* no IndexedDB — the button simply does not appear */ });
    return () => { live = false; };
  }, [language]);

  const go = useCallback(async () => {
    if (!book || !next) return;
    setBusy(true);
    setError('');
    try {
      const passage = await buildEpubSection(book, next.chapter, next.section, { language, deck, dueWords, blankDensity });
      if (!passage) return;
      await savePosition(book.id, next.chapter, next.section);
      onCommit(passage);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }, [book, next, language, deck, dueWords, blankDensity, onCommit]);

  if (!book) return null;

  return (
    <div className="mt-8 pt-8" style={{ borderTop: '1px solid var(--line)' }}>
      <div style={{ ...mono, fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
        {book.title}
      </div>

      {next ? (
        <>
          <button
            onClick={go}
            disabled={busy}
            className="cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-default"
            style={{
              ...mono, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500,
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9,
              padding: '12px 20px', boxShadow: busy ? 'none' : '0 2px 0 var(--accent-deep)',
            }}
          >
            {busy ? 'Preparing…' : 'Next section →'}
          </button>
          <div style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)', marginTop: 8 }}>
            {positionLabel(book, next.chapter, next.section)}
          </div>
        </>
      ) : (
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, margin: 0 }}>
          That was the last section — you&rsquo;ve finished {book.title}.
        </p>
      )}

      {error && <p style={{ ...mono, fontSize: 11.5, color: 'var(--wrong)', marginTop: 8 }}>{error}</p>}
    </div>
  );
}
