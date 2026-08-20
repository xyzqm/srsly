import type { DeckWord } from './types';
import { todayStr } from './deck';

/**
 * A per-day count of cards actually graded — the data behind the review heatmap.
 *
 * WHY THIS HAD TO EXIST. Nothing in the app remembered what you did on a past day.
 * `srsly-review-counts` holds one day and resets at the rollover (it exists to enforce the
 * daily caps, not to keep history), and `SRSState.accuracy` records only passage cloze
 * answers, trimmed to 30 days — it would miss every flashcard review and could not reach
 * three months. A heatmap drawn from either would have been decoration rather than a record.
 *
 * WHAT COUNTS AS ONE UNIT: one card graded, from any surface. It is written at the single
 * point both surfaces pass through (useVocabDeck's gradeCard / updateWordReview), so
 * flashcards and finishing a passage land in the same series and neither can drift.
 */

export interface DayActivity { d: string; n: number }

const KEY = 'srsly-activity-log';

/** Kept a little beyond the 3-month heatmap so the window can grow without losing data. */
export const ACTIVITY_WINDOW_DAYS = 120;

function cutoff(): string {
  const x = new Date();
  x.setDate(x.getDate() - ACTIVITY_WINDOW_DAYS);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** The recorded log, oldest first, pruned to the window. Never throws. */
export function getActivityLog(): DayActivity[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const min = cutoff();
    return raw
      .filter((e): e is DayActivity => !!e && typeof e.d === 'string' && typeof e.n === 'number' && e.d >= min)
      .sort((a, b) => a.d.localeCompare(b.d));
  } catch {
    return [];
  }
}

/**
 * Record `count` graded cards against today.
 *
 * Deliberately fire-and-forget and never throwing: losing a heatmap square is not a reason
 * to fail a review that the scheduler has already applied.
 */
export function logGraded(count = 1): void {
  if (typeof localStorage === 'undefined' || count <= 0) return;
  try {
    const log = getActivityLog();
    const today = todayStr();
    const i = log.findIndex(e => e.d === today);
    if (i >= 0) log[i] = { d: today, n: log[i].n + count };
    else log.push({ d: today, n: count });
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch { /* quota or private mode — the review itself already landed */ }
}

/**
 * Recorded study, as a date → count map. `firstRecorded` is the first day covered.
 *
 * ONLY WHAT WAS ACTUALLY LOGGED. This used to merge in a reconstruction from each card's
 * `lastReview`, drawn hollow and labelled "a minimum, not a total". The count was indeed a
 * floor — but the SHAPE was wrong, which the label did not admit. `lastReview` holds one
 * date per card, so a card reviewed forty times over two months contributed a single square
 * on the day it was last seen. Study fifty cards on Monday and review the same fifty on
 * Friday and Monday reads as a rest day while Friday shows fifty: the session did not
 * undercount, it moved.
 *
 * A heatmap whose bars are in the wrong places is worse than a short one, so the graph now
 * starts where the log does and says so.
 */
export function mergedActivity(deck: DeckWord[]): { counts: Map<string, number>; firstRecorded: string | null } {
  void deck;   // kept in the signature so callers need not change; nothing is derived from it
  const log = getActivityLog();
  const counts = new Map<string, number>();
  for (const { d, n } of log) counts.set(d, n);
  return { counts, firstRecorded: log.length ? log[0].d : null };
}
