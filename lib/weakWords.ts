import type { DeckWord } from './types';

/**
 * The words that keep beating you, ranked.
 *
 * The Cram tab already FILTERS for trouble — "Forgotten" is every card with a lapse, "Stuck"
 * is every leech — but a filter is not a ranking. Thirty forgotten words in deck order tells
 * you that you have thirty problems, not which two are the problem, and the deck otherwise
 * records every lapse and never once shows them back to you.
 *
 * MEASURED AS A RATE, NOT A COUNT. Raw lapses reward age: a word you have met sixty times has
 * had sixty chances to be failed, and one you met nine times has had nine. Six lapses in nine
 * encounters is a word you do not know; six in sixty is a word you mostly know and
 * occasionally slip on, and ordering by count puts them side by side. `reviews` counts only
 * successes in this codebase (see fsrsSchedule) and `lapses` only failures, so encounters is
 * their sum and the rate is exact rather than estimated.
 *
 * MINIMUM TWO LAPSES. One is a bad morning, a mistyped answer, a word met while tired — and
 * at one lapse in one encounter the rate is a perfect 100%, which would put every unlucky new
 * card above every genuine problem. Two is the smallest number that can show a pattern.
 *
 * Nothing here is a new metric competing with FSRS's own difficulty. Difficulty is the
 * model's forward-looking estimate and moves slowly by design; this is the plain historical
 * record, which is what someone asking "what am I bad at" is actually asking for.
 */

export interface WeakWord {
  word: DeckWord;
  /** Times forgotten. */
  lapses: number;
  /** Times the card has been graded at all — successes plus failures. */
  encounters: number;
  /** lapses / encounters, 0–1. */
  rate: number;
}

/** Below this a lapse record is noise rather than a pattern — see above. */
export const MIN_LAPSES = 2;

export function weakestWords(deck: DeckWord[], limit = 8): WeakWord[] {
  return deck
    // Pool words have never been studied, so they have no record to rank.
    .filter(w => !w.pool && (w.lapses ?? 0) >= MIN_LAPSES)
    .map(w => {
      const lapses = w.lapses ?? 0;
      const encounters = (w.reviews ?? 0) + lapses;
      return { word: w, lapses, encounters, rate: encounters > 0 ? lapses / encounters : 0 };
    })
    .sort((a, b) => b.rate - a.rate || b.lapses - a.lapses || a.word.h.localeCompare(b.word.h))
    .slice(0, limit);
}
