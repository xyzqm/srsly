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

/** Whether a word belongs to the selected study deck (empty/undefined = all decks). */
export function inStudyDeck(w: DeckWord, studyDeck?: string): boolean {
  if (!studyDeck) return true;
  return (w.deck || '') === studyDeck;
}

/**
 * Whether a word belongs to ANY of the selected decks (multi-select). The selection is:
 *   null / undefined → all decks (default)
 *   []               → no decks (explicitly deselected everything)
 *   [...]            → only those decks (default/untagged deck is the empty string '')
 */
export function inSelectedDecks(w: DeckWord, decks?: string[] | null): boolean {
  if (decks == null) return true;        // all
  if (decks.length === 0) return false;  // none
  return decks.includes(w.deck || '');
}

/** Stable cache/identity signature for a multi-deck selection ('' default → '(default)'). */
export function decksSignature(decks?: string[] | null): string {
  if (decks == null) return '';          // all
  if (decks.length === 0) return 'none';
  return [...decks].map(d => d || '(default)').sort().join('|');
}

/** Distinct deck names present in the deck, sorted alphabetically. */
export function deckNames(deck: DeckWord[]): string[] {
  const names = new Set<string>();
  for (const w of deck) { if (w.deck) names.add(w.deck); }
  return [...names].sort((a, b) => a.localeCompare(b));
}
