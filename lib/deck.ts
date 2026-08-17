import type { DeckWord } from './types';

/** Formats a Date as YYYY-MM-DD using its local calendar day (not UTC). */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Today as YYYY-MM-DD in the user's local timezone. Using UTC here would roll the
 * date over mid-evening for anyone west of UTC, scheduling reviews a day later than
 * expected — so every "what day is it" check in the app must go through this helper.
 */
export function todayStr(): string {
  return localDateStr(new Date());
}

/** N days from today (local calendar day) as YYYY-MM-DD. */
export function dateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

/** Fisher-Yates shuffle; returns a new array, does not mutate the input. */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A word participates in review only when it's neither paused nor currently
 * snoozed. Paused (indefinite) and snoozed (until a date) are srsly's versions
 * of Anki's suspend / bury — both pull the word out of every review surface
 * (flashcards, fill-in-blank, daily-passage word selection).
 */
export function isActive(w: DeckWord, today: string = todayStr()): boolean {
  if (w.pool) return false;
  if (w.paused) return false;
  if (w.snoozeUntil && w.snoozeUntil > today) return false;
  return true;
}

/** Active AND due today (or new). The single source of truth for "study this now". */
export function isDueToday(w: DeckWord, today: string = todayStr()): boolean {
  if (!isActive(w, today)) return false;
  return !w.dueAt || w.dueAt <= today;
}

/**
 * Due today AND its intra-day learning step has already elapsed.
 *
 * A card in the learning phase carries `dueAtMs` — "come back in ten minutes" — while its
 * `dueAt` stays today. `isDueToday` only reads the date, so it answers true for a card that
 * is not actually ready yet. That is CORRECT for the flashcard queue, which wants the card
 * in the session and shows a countdown until the moment arrives, and wrong for the reading
 * passage, which has no countdown and would simply blank the word again.
 *
 * So the two callers get different tests rather than one test with an exception in it.
 */
export function isReadyNow(w: DeckWord, today: string = todayStr(), nowMs: number = Date.now()): boolean {
  return isDueToday(w, today) && (!w.dueAtMs || w.dueAtMs <= nowMs);
}

