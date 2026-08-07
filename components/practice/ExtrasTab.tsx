'use client';
import { useState, useMemo } from 'react';
import type { PracticeMode } from '@/lib/types';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { useLanguage } from '@/lib/LanguageContext';
import { dateInDays } from '@/lib/deck';
import Flashcards from './Flashcards';

const MODES: { id: PracticeMode; label: string }[] = [
  { id: 'flash', label: 'Flashcards' },
  { id: 'cram',  label: 'Cram' },
];

type CramScope = 'all' | 'focus' | 'leech' | 'forgotten' | 'soon';

interface Props {
  onScore: (score: number) => void;
  /** Mode to open in — 'flash' for review-due, 'cram' for a whole-deck drill. */
  initialMode?: PracticeMode;
}

export default function ExtrasTab({ onScore, initialMode = 'flash' }: Props) {
  const language = useLanguage();
  const { deck, deckLoaded, gradeCard } = useVocabDeck(language);
  const [mode, setMode] = useState<PracticeMode>(initialMode);

  // One deck per language, so practice always pulls from the whole of it.
  const scopedDeck = deck;

  // Cram: a deliberate drill of a chosen subset, ignoring due dates and schedule.
  const [cramScope, setCramScope] = useState<CramScope>('all');
  const cramDeck = useMemo(() => {
    switch (cramScope) {
      case 'focus':     return scopedDeck.filter(w => w.focus);
      case 'leech':     return scopedDeck.filter(w => w.leech);
      case 'forgotten': return scopedDeck.filter(w => (w.lapses ?? 0) > 0);
      case 'soon':      { const lim = dateInDays(7); return scopedDeck.filter(w => w.dueAt && w.dueAt <= lim); }
      default:          return scopedDeck;
    }
  }, [scopedDeck, cramScope]);

  const toggleStyle = (on: boolean) => ({
    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' as const,
    background: on ? 'var(--card)' : 'none',
    color: on ? 'var(--accent)' : 'var(--ink-soft)',
    boxShadow: on ? '0 1px 3px rgba(0,0,0,.07)' : 'none',
    border: 'none', borderRadius: 7, padding: '9px 15px', cursor: 'pointer', fontWeight: on ? 500 : undefined,
    transition: 'all .15s',
  });

  return (
    <div
      className="rounded-tr-xl rounded-b-xl px-9 py-8 animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
      {/* Mode switcher */}
      <div className="flex justify-between items-center gap-3 mb-6 flex-wrap">
        <div className="inline-flex gap-1 p-[5px] rounded-[11px] flex-wrap" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={toggleStyle(mode === m.id)}>{m.label}</button>
          ))}
        </div>
      </div>

      {/* Keyed by language, and both instances gated on deckLoaded.
          Flashcards latches its queue on first load and never rebuilds it — deliberately, so
          grading a card can't reshuffle the session underneath you. That made switching
          language while practising leave the OLD language's cards on screen: `hola` sitting
          in a Japanese session. A key makes the switch a new session, which it is; passing
          deckLoaded stops the fresh mount latching the outgoing deck, which useVocabDeck
          still holds for the tick between the language changing and the new deck arriving. */}
      {mode === 'flash' && (
        <Flashcards
          key={`flash-${language}`}
          deck={scopedDeck} deckLoaded={deckLoaded}
          onGrade={gradeCard} onScore={onScore} onDone={() => setMode('cram')}
        />
      )}
      {mode === 'cram' && (
        <div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '52ch', lineHeight: 1.55, marginBottom: 14 }}>
            Drill a set of words now, ignoring due dates — and without changing their
            schedule. Good for cramming before a test. &ldquo;Again&rdquo; re-shows the card
            later in this session.
          </p>
          <div className="flex flex-wrap gap-1.5 mb-6">
            {([
              ['all',       `All ${scopedDeck.length}`],
              ['focus',     `★ Focus ${scopedDeck.filter(w => w.focus).length}`],
              ['leech',     `Stuck ${scopedDeck.filter(w => w.leech).length}`],
              ['forgotten', `Forgotten ${scopedDeck.filter(w => (w.lapses ?? 0) > 0).length}`],
              ['soon',      `Due soon ${scopedDeck.filter(w => w.dueAt && w.dueAt <= dateInDays(7)).length}`],
            ] as [CramScope, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCramScope(key)}
                className="cursor-pointer transition-all duration-150"
                style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.04em',
                  background: cramScope === key ? 'var(--ink)' : 'none',
                  color: cramScope === key ? 'var(--paper)' : 'var(--ink-faint)',
                  border: `1px solid ${cramScope === key ? 'var(--ink)' : 'var(--line)'}`,
                  borderRadius: 7, padding: '5px 11px',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {cramDeck.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--ink-soft)', fontFamily: 'var(--f-mono)', fontSize: 13 }}>
              No words in this set.
            </div>
          ) : (
            <Flashcards key={`cram-${language}-${cramScope}`} deck={cramDeck} deckLoaded={deckLoaded} cram onDone={() => setMode('flash')} />
          )}
        </div>
      )}
    </div>
  );
}
