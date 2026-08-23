'use client';
import { useEffect, useMemo } from 'react';
import { stopAll } from '@/lib/speech';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { useLanguage } from '@/lib/LanguageContext';
import Flashcards from './Flashcards';

/**
 * The SRS tab — everything the scheduler drives.
 *
 * The app now draws one line down the middle: READING is your own material (starter texts,
 * articles, clips, books) and never touches a schedule, and SRS is the scheduled review that
 * FSRS actually runs. Keeping both in one tab meant the same screen sometimes graded you and
 * sometimes did not, and nothing on it said which.
 *
 * CRAM WAS REMOVED. It drilled a chosen set while deliberately changing nothing — no
 * scheduling, no counts, no streak — which made it the one thing in here that was not SRS at
 * all, sitting in the tab named after it.
 */

interface Props {
  onScore: (score: number) => void;
  /** False while the tab is kept alive but hidden — see components/TabPanel.tsx. */
  active?: boolean;
}

export default function SrsTab({ onScore, active = true }: Props) {
  const language = useLanguage();
  const { deck, deckLoaded, gradeCard } = useVocabDeck(language);

  /**
   * Pool words are not studiable.
   *
   * Normal review already excludes them — `isDueToday` goes through `isActive`, which returns
   * false for anything pooled — but filtering here keeps that true for anything else this tab
   * grows later, and costs nothing.
   */
  const scopedDeck = useMemo(() => deck.filter(w => !w.pool), [deck]);

  /**
   * Stop speech when the tab is hidden. Flashcards speak on reveal and on replay, and with
   * the panel kept alive that audio would otherwise follow you onto whatever you switched to.
   */
  useEffect(() => { if (!active) stopAll(); }, [active]);

  return (
    <div
      className="rounded-tr-xl rounded-b-xl px-9 py-8 animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
      {/* Keyed by language, and gated on deckLoaded.
          Flashcards latches its queue on first load and never rebuilds it — deliberately, so
          grading a card can't reshuffle the session underneath you. That made switching
          language while practising leave the OLD language's cards on screen: `hola` sitting
          in a Japanese session. A key makes the switch a new session, which it is; passing
          deckLoaded stops the fresh mount latching the outgoing deck, which useVocabDeck
          still holds for the tick between the language changing and the new deck arriving. */}
      <Flashcards
        key={`flash-${language}`}
        deck={scopedDeck}
        deckLoaded={deckLoaded}
        onGrade={gradeCard}
        onScore={onScore}
      />
    </div>
  );
}
