import type { DeckWord } from './types';

/** Formats a Date as YYYY-MM-DD using its local calendar day (not UTC). */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** A Date `n` local days from now (used for card `due` overrides). */
export function dayOffset(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
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
export function isActive(w: DeckWord, now: Date = new Date()): boolean {
  if (w.pool) return false;
  if (w.paused) return false;
  if (w.snoozeUntil && w.snoozeUntil > localDateStr(now)) return false;
  return true;
}

/** Active AND due on/before today's local calendar day. The single source of truth for
 *  "study this now". Compares by calendar day so a card due later today still counts. */
export function isDueToday(w: DeckWord, now: Date = new Date()): boolean {
  if (!isActive(w, now)) return false;
  return localDateStr(w.due) <= localDateStr(now);
}

/** Whether a word belongs to the selected study deck (empty/undefined = all decks).
 *  Decks are tags: a word can be in several, so membership is array containment. */
export function inStudyDeck(w: DeckWord, studyDeck?: string): boolean {
  if (!studyDeck) return true;
  return !!w.decks?.includes(studyDeck);
}

/**
 * Whether a word belongs to ANY of the selected decks (multi-select). Decks are tags,
 * so this tests the word's `decks` membership against the selection. Selection is:
 *   null / undefined → all decks (default)
 *   []               → no decks (explicitly deselected everything)
 *   [...]            → only those decks (the default/untagged "deck" is the empty string '')
 */
export function inSelectedDecks(w: DeckWord, decks?: string[] | null): boolean {
  if (decks == null) return true;        // all
  if (decks.length === 0) return false;  // none
  const tags = w.decks ?? [];
  if (tags.length === 0) return decks.includes(''); // untagged word ↔ the '' default deck
  return tags.some(t => decks.includes(t));
}

/** Stable cache/identity signature for a multi-deck selection ('' default → '(default)'). */
export function decksSignature(decks?: string[] | null): string {
  if (decks == null) return '';          // all
  if (decks.length === 0) return 'none';
  return [...decks].map(d => d || '(default)').sort().join('|');
}

/** Distinct deck names present across all words' tags, sorted alphabetically. */
export function deckNames(deck: DeckWord[]): string[] {
  const names = new Set<string>();
  for (const w of deck) { for (const d of w.decks ?? []) names.add(d); }
  return [...names].sort((a, b) => a.localeCompare(b));
}
