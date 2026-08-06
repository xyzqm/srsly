import type { DeckWord } from './types';

/**
 * How well-rooted a word is, as a continuous 0–1 value.
 *
 * WHY STABILITY AND NOT A POINTS SYSTEM
 * FSRS already computes the only number worth showing: `stability`, the days until recall
 * probability decays to ~90%. It is earned, it is honest, and it cannot be farmed by
 * opening the app — the only way to raise it is to actually remember something later than
 * you did last time. Everything here is a rendering of that number; nothing is invented.
 *
 * WHY LOGARITHMIC
 * Stability spans four orders of magnitude — a new card sits near 0.5 days, a mature one
 * past 1,000. Mapped linearly, every card below a few months would render identically at
 * the bottom of the scale and growth would appear to stop. On a log curve each review
 * moves the plant a visible amount for the whole life of the card:
 *
 *     1 day  0.12      14 days  0.46      90 days  0.77
 *     3 days 0.24      30 days  0.58     180 days  0.88
 *     7 days 0.35      60 days  0.70     365 days  1.00
 *
 * Doubling an interval is a constant step up, which matches how the scheduler actually
 * behaves and keeps the reward proportional to the work at every level.
 */

/** Stability (days) treated as fully grown. A year of retention is a mature word. */
const FULL_GROWTH_DAYS = 365;

/**
 * A word's growth, 0 (just planted) → 1 (fully grown).
 *
 * A card with no `stability` has never graduated a review, so it reads as bare soil rather
 * than as a seedling — there is a difference between "not started" and "started badly",
 * and the display should not flatter the first into looking like the second.
 */
export function growthOf(word: DeckWord): number {
  if (word.pool) return 0;                       // staged, not yet in circulation
  const s = word.stability;
  if (!s || s <= 0) return 0;
  const g = Math.log(1 + s) / Math.log(1 + FULL_GROWTH_DAYS);
  return Math.min(1, Math.max(0, g));
}

/** Words the garden should draw at all — pool cards are not planted yet. */
export function isPlanted(word: DeckWord): boolean {
  return !word.pool;
}

/**
 * A loose name for a growth value. Used for labels and tooltips only — the drawing itself
 * is continuous, so these never produce a visible step.
 */
export function growthLabel(g: number): string {
  if (g <= 0)    return 'not yet rooted';
  if (g < 0.25)  return 'seedling';
  if (g < 0.45)  return 'sprout';
  if (g < 0.65)  return 'sapling';
  if (g < 0.85)  return 'young tree';
  return 'fully grown';
}

/** Deck-level summary for the garden header. */
export function gardenSummary(deck: DeckWord[]) {
  const planted = deck.filter(isPlanted);
  const growths = planted.map(growthOf);
  const rooted = growths.filter(g => g > 0);
  const mean = rooted.length ? rooted.reduce((a, b) => a + b, 0) / rooted.length : 0;
  return {
    planted: planted.length,
    rooted: rooted.length,
    /** Average growth across words that have taken root, 0–1. */
    canopy: mean,
    /** Longest interval any single card has earned, in days. */
    strongest: planted.reduce((m, w) => Math.max(m, w.stability ?? 0), 0),
  };
}
