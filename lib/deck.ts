import type { DeckWord } from './types';

/** Today as YYYY-MM-DD (UTC day, matching the rest of the app's date handling). */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** N days from today as YYYY-MM-DD. */
export function dateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A word participates in review only when it's neither paused nor currently
 * snoozed. Paused (indefinite) and snoozed (until a date) are srsly's versions
 * of Anki's suspend / bury — both pull the word out of every review surface
 * (flashcards, fill-in-blank, daily-passage word selection).
 */
export function isActive(w: DeckWord, today: string = todayStr()): boolean {
  if (w.paused) return false;
  if (w.snoozeUntil && w.snoozeUntil > today) return false;
  return true;
}

/** Active AND due today (or new). The single source of truth for "study this now". */
export function isDueToday(w: DeckWord, today: string = todayStr()): boolean {
  if (!isActive(w, today)) return false;
  return !w.dueAt || w.dueAt <= today;
}
