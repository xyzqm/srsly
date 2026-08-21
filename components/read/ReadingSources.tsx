'use client';
import { useEffect, useState } from 'react';
import type { DeckWord, DailyPassage, LanguageCode } from '@/lib/types';
import PasteTextPanel from './PasteTextPanel';
import EpubPanel from './EpubPanel';
import LyricPlayer from './LyricPlayer';

/**
 * The ways to get something to read, behind one control.
 *
 * They used to sit as three dashed buttons stacked permanently above the passage — "read your
 * own text", "read a book", "learn from a song" — which is three pieces of furniture on every
 * visit for something most sessions never touch, and it grew by one every time a source was
 * added. One "+ Add reading" opens the lot.
 *
 * Kept OPEN when there is nothing to read. On an empty tab the chooser is not clutter, it is
 * the entire point of the screen, and hiding it behind a click there would be hiding the only
 * thing worth doing.
 */

interface Props {
  language: LanguageCode;
  deck: DeckWord[];
  dueWords: Set<string>;
  blankDensity?: number;
  onCommit: (passage: DailyPassage) => void;
  /** True when the tab has no passage — the chooser then starts expanded. */
  emptyTab: boolean;
}

export default function ReadingSources({ language, deck, dueWords, blankDensity, onCommit, emptyTab }: Props) {
  const [open, setOpen] = useState(emptyTab);

  // Fold away once something arrives to read. Without this the chooser stayed expanded above
  // the passage it had just produced, which is the clutter it exists to remove.
  useEffect(() => { if (!emptyTab) setOpen(false); }, [emptyTab]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cursor-pointer transition-all duration-150"
        style={{
          fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em',
          textTransform: 'uppercase', background: 'none', border: '1px dashed var(--line)',
          borderRadius: 9, padding: '9px 15px', color: 'var(--ink-soft)',
        }}
      >
        + Add reading
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-start w-full">
      {!emptyTab && (
        <button
          onClick={() => setOpen(false)}
          className="cursor-pointer"
          style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, background: 'none', border: 'none', padding: 0, color: 'var(--ink-faint)' }}
        >
          − hide
        </button>
      )}
      <PasteTextPanel
        language={language}
        deck={deck}
        dueWords={dueWords}
        blankDensity={blankDensity}
        onCommit={onCommit}
      />
      <EpubPanel
        language={language}
        deck={deck}
        dueWords={dueWords}
        blankDensity={blankDensity}
        onCommit={onCommit}
      />
      {/* A song does NOT become a passage — the sync is the point, and committing the lyrics
          would flatten them back into prose. It renders its own tokens instead. */}
      <LyricPlayer language={language} deck={deck} />
    </div>
  );
}
