'use client';
import { useEffect, useState } from 'react';
import type { DeckWord, DailyPassage, LanguageCode } from '@/lib/types';
import PasteTextPanel from './PasteTextPanel';
import EpubPanel from './EpubPanel';
import StarterPanel from './StarterPanel';

/**
 * The ways to get something to read.
 *
 * TWO SHAPES, and the difference is the whole design:
 *
 * - **Nothing to read yet** → four cards, laid out as the primary content of the screen.
 *   There is nothing else on an empty tab, so the chooser IS the screen and hiding it behind
 *   a click hides the only thing worth doing. It leads with a starter text because the other
 *   three all ask the learner to supply something — an article, a book, an audio file — and a
 *   first session that cannot start is the whole funnel.
 * - **Already reading** → one "+ Add reading" button. Once a passage is on screen the chooser
 *   is furniture, and it grew by one every time a source was added.
 *
 * An earlier pass collapsed BOTH states to the single button, on the reasoning that one
 * control should look the same wherever you meet it. That was right about consistency and
 * wrong about the empty tab, where it left a beginner with a bare screen, a disabled Generate
 * button and no way in. What made the old empty tab bad was three identical unlabelled dashed
 * buttons, not the fact that the options were visible — cards with icons and a line of
 * explanation are a different thing.
 */

interface Props {
  language: LanguageCode;
  deck: DeckWord[];
  dueWords: Set<string>;
  blankDensity?: number;
  onCommit: (passage: DailyPassage) => void;
  /**
   * Where a BOOK section goes. Separate from `onCommit` because a book is not another article
   * in the list — it has its own place, its own position, and its own way out. See ReadTab.
   */
  onCommitBook: (passage: DailyPassage) => void;
  /** True when the tab has no passage — the chooser then leads the screen. */
  emptyTab: boolean;
  /** An article sent in by the web clipper — opens the paste source with it loaded. */
  clip?: { title: string; text: string } | null;
}

type Source = 'starter' | 'paste' | 'epub';

const CARDS: { id: Source; icon: string; label: string; hint: string }[] = [
  { id: 'starter', icon: '📖', label: 'Start with a story', hint: 'Three short texts, ready to read' },
  { id: 'paste',   icon: '📋', label: 'Paste any article',  hint: 'Anything you already want to read' },
  { id: 'epub',    icon: '📚', label: 'Upload a book',      hint: 'EPUB — read a chapter at a time' },
];

const mono = { fontFamily: 'var(--f-mono)' } as const;

export default function ReadingSources({ language, deck, dueWords, blankDensity, onCommit, onCommitBook, emptyTab, clip = null }: Props) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source | null>(null);

  // Fold away once something arrives to read — otherwise the chooser stays expanded above the
  // passage it just produced, which is the clutter it exists to remove.
  useEffect(() => { if (!emptyTab) { setOpen(false); setSource(null); } }, [emptyTab]);

  // A clip is a source already chosen: skip the four cards and open paste with it loaded.
  useEffect(() => { if (clip) { setOpen(true); setSource('paste'); } }, [clip]);

  const panelProps = { language, deck, dueWords, blankDensity, onCommit };

  function panel(s: Source) {
    if (s === 'starter') return <StarterPanel {...panelProps} />;
    if (s === 'paste') return <PasteTextPanel {...panelProps} startOpen clip={clip} />;
    return <EpubPanel {...panelProps} onCommit={onCommitBook} startOpen />;
  }

  const back = (
    <button
      onClick={() => setSource(null)}
      className="cursor-pointer"
      style={{ ...mono, fontSize: 11, background: 'none', border: 'none', padding: 0, color: 'var(--ink-faint)', alignSelf: 'flex-start' }}
    >
      ← all reading options
    </button>
  );

  /* ── Empty tab: the chooser leads the screen ─────────────────────────────── */
  if (emptyTab) {
    if (source) {
      return <div className="flex flex-col gap-3 w-full">{back}{panel(source)}</div>;
    }
    return (
      <div className="w-full">
        <div style={{ ...mono, fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
          Read something
        </div>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {CARDS.map(c => (
            <button
              key={c.id}
              onClick={() => setSource(c.id)}
              className="cursor-pointer transition-all duration-150 text-left"
              style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '15px 16px' }}
            >
              <div style={{ fontSize: 19, lineHeight: 1, marginBottom: 9 }}>{c.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{c.label}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.45 }}>{c.hint}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ── Reading already: one button ─────────────────────────────────────────── */
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cursor-pointer transition-all duration-150"
        style={{
          ...mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
          background: 'none', border: '1px dashed var(--line)', borderRadius: 9,
          padding: '9px 15px', color: 'var(--ink-soft)',
        }}
      >
        + Add reading
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-start w-full">
      <button
        onClick={() => { setOpen(false); setSource(null); }}
        className="cursor-pointer"
        style={{ ...mono, fontSize: 10.5, background: 'none', border: 'none', padding: 0, color: 'var(--ink-faint)' }}
      >
        − hide
      </button>
      {source ? (
        <>{back}{panel(source)}</>
      ) : (
        <div className="grid gap-2 w-full" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {CARDS.map(c => (
            <button
              key={c.id}
              onClick={() => setSource(c.id)}
              className="cursor-pointer transition-all duration-150 text-left"
              style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}
            >
              <span style={{ fontSize: 14, marginRight: 7 }}>{c.icon}</span>
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
