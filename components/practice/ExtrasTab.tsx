'use client';
import { useState, useMemo, useEffect } from 'react';
import type { PracticeMode } from '@/lib/types';
import { weakestWords } from '@/lib/weakWords';
import SetLegend, { SET_HELP, CRAM_HELP } from '@/components/shared/SetLegend';
import { stopAll } from '@/lib/speech';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { useLanguage } from '@/lib/LanguageContext';
import Flashcards from './Flashcards';

const MODES: { id: PracticeMode; label: string }[] = [
  { id: 'flash', label: 'Flashcards' },
  { id: 'cram',  label: 'Cram' },
];

type CramScope = 'all' | 'weak' | 'focus' | 'leech';

interface Props {
  onScore: (score: number) => void;
  /** Mode to open in — 'flash' for review-due, 'cram' for a whole-deck drill. */
  initialMode?: PracticeMode;
  /** False while the tab is kept alive but hidden — see components/TabPanel.tsx. */
  active?: boolean;
  /** Cram set to open on, when the caller is handing off to a specific one. */
  initialCramScope?: string;
}

export default function ExtrasTab({ onScore, initialMode = 'flash', initialCramScope, active = true }: Props) {
  const language = useLanguage();
  const { deck, deckLoaded, gradeCard } = useVocabDeck(language);
  const [mode, setMode] = useState<PracticeMode>(initialMode);

  // One deck per language, so practice always pulls from the whole of it.
  /**
   * Pool words are not studiable, in any mode.
   *
   * Normal review already excludes them — `isDueToday` goes through `isActive`, which returns
   * false for anything pooled. Cram deliberately ignores due dates, so it never reaches that
   * test, and this was the whole deck: import HSK 3 and "Cram · All" offered 600 words you had
   * just deliberately parked. Cram also does not change schedules, so drilling them recorded
   * nothing and left them pooled — study with no progress attached to it.
   *
   * Only `pool`. Paused and snoozed cards stay available on purpose: those are cards in
   * circulation that you deferred, and "drill this now regardless" is exactly what cram is
   * for — the Stuck set is auto-paused leeches and would be empty otherwise. A pooled word is
   * categorically different: it has never entered circulation at all.
   */
  const scopedDeck = useMemo(() => deck.filter(w => !w.pool), [deck]);

  // Cram: a deliberate drill of a chosen subset, ignoring due dates and schedule.
  const [cramScope, setCramScope] = useState<CramScope>('all');
  // Adopt a requested set when the caller changes it — Stats' "Drill these" arrives this way,
  // and arrives AFTER this component may already be mounted, so a lazy initial value misses it.
  useEffect(() => {
    if (initialCramScope) setCramScope(initialCramScope as CramScope);
  }, [initialCramScope]);

  /**
   * The panel now survives a tab switch, so `useState(initialMode)` only ever runs once — a
   * later handoff from Vocab or Stats would arrive at a component that had already chosen its
   * mode and be ignored. Keyed on the request rather than merged into the effect above,
   * because "study now" sets only the mode and "drill these" sets both.
   */
  useEffect(() => { setMode(initialMode); }, [initialMode]);

  /**
   * Stop speech when the tab is hidden. Flashcards speak on reveal and on replay, and with
   * the panel kept alive that audio would otherwise follow you onto whatever you switched to.
   */
  useEffect(() => { if (!active) stopAll(); }, [active]);
  const cramDeck = useMemo(() => {
    switch (cramScope) {
      // Ranked, not filtered — the ORDER is the feature, so it comes from weakestWords
      // rather than being another predicate here. See lib/weakWords.ts.
      case 'weak':      return weakestWords(scopedDeck).map(x => x.word);
      case 'focus':     return scopedDeck.filter(w => w.focus);
      case 'leech':     return scopedDeck.filter(w => w.leech);
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
          <div className="flex flex-wrap items-center gap-1.5 mb-6">
            {([
              ['all',       `All ${scopedDeck.length}`],
              ['weak',      `Trouble ${weakestWords(scopedDeck).length}`],
              ['focus',     `★ Focus ${scopedDeck.filter(w => w.focus).length}`],
              ['leech',     `Stuck ${scopedDeck.filter(w => w.leech).length}`],
            ] as [CramScope, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCramScope(key)}
                title={CRAM_HELP[key] ?? SET_HELP[key]}
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
            <SetLegend
              keys={['all', 'weak', 'focus', 'leech']}
              labels={{ all: 'All', weak: 'Trouble', focus: '★ Focus', leech: 'Stuck' }}
              overrides={CRAM_HELP}
            />
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
