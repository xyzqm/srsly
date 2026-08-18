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
 * What the DECK can tell us about days before the log existed.
 *
 * Each card carries `lastReview`, the date it was most recently graded, so a card is
 * evidence of exactly one review on exactly one day. That makes this a FLOOR, never a true
 * count: a card reviewed on five days contributes only to the latest, and a day whose cards
 * have all since been reviewed again contributes nothing at all.
 *
 * It is therefore merged with `max`, not added — adding a floor to a real count would
 * inflate days that have both. And the UI must say which region is reconstructed, because
 * an undercount presented as history is a lie about how much work someone did.
 */
export function backfillFromDeck(deck: DeckWord[]): Map<string, number> {
  const out = new Map<string, number>();
  const min = cutoff();
  for (const w of deck) {
    if (!w.lastReview || w.lastReview < min) continue;
    out.set(w.lastReview, (out.get(w.lastReview) ?? 0) + 1);
  }
  return out;
}

/**
 * Recorded counts merged with the deck-derived floor, as a date → count map.
 * `firstRecorded` is the first day the log itself covers; everything before it is
 * reconstruction and the caller must label it as such.
 */
export function mergedActivity(deck: DeckWord[]): { counts: Map<string, number>; firstRecorded: string | null } {
  const log = getActivityLog();
  const counts = backfillFromDeck(deck);
  for (const { d, n } of log) counts.set(d, Math.max(n, counts.get(d) ?? 0));
  return { counts, firstRecorded: log.length ? log[0].d : null };
}
