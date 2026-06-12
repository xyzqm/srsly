/**
 * Simplified FSRS (Free Spaced Repetition Scheduler)
 * Inspired by FSRS-4.5. Core concepts:
 *   - Stability (S): number of days until retrievability drops to ~90%
 *   - Difficulty (D, 1–10): harder cards grow stability more slowly
 *   - Lapses: forgotten-review count; each lapse shrinks stability further
 *   - Interval ≈ stability days (for 90% target retention)
 *
 * Migration: words that have `reviews` but no `stability` (created by the old
 * simple-SRS scheduler) get their stability bootstrapped from the old intervals
 * so they aren't reset to "new card" on first FSRS grade.
 */
import type { DeckWord } from './types';

/** FSRS grade: 1=Again, 2=Hard, 3=Good, 4=Easy */
export type FsrsGrade = 1 | 2 | 3 | 4;

// Initial stability (days) and difficulty (1–10) for brand-new cards by grade
const INIT_S: Record<FsrsGrade, number> = { 1: 0.4, 2: 1.8, 3: 5.5, 4: 14 };
const INIT_D: Record<FsrsGrade, number> = { 1: 7,   2: 6,   3: 5,   4: 4  };

// Old simple-SRS schedule — used only for migration bootstrap
const OLD_SRS_DAYS = [1, 3, 7, 14, 30, 60];

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000,
  ));
}

/**
 * Compute new SRS fields for a card after a user grades it.
 * Returns a partial DeckWord — merge into the existing entry.
 */
export function fsrsSchedule(word: DeckWord, grade: FsrsGrade): Partial<DeckWord> {
  const today = new Date().toISOString().slice(0, 10);

  // ── Bootstrap stability from old review count (one-time migration) ───────
  let S = word.stability;
  let D = word.difficulty;
  const L = word.lapses ?? 0;

  if (S === undefined) {
    const rev = word.reviews ?? 0;
    if (rev > 0) {
      // Approximate: assume the word was reviewed well each time
      S = OLD_SRS_DAYS[Math.min(rev, OLD_SRS_DAYS.length - 1)];
      D = Math.max(1, Math.min(10, 6 - Math.round(rev / 2))); // rough difficulty from review count
    }
  }

  // ── First review (truly new card) ────────────────────────────────────────
  if (S === undefined) {
    const initS = INIT_S[grade];
    const initD = INIT_D[grade];
    const interval = grade === 1 ? 1 : Math.max(1, Math.round(initS));
    return {
      stability: initS,
      difficulty: initD,
      lapses: grade === 1 ? 1 : 0,
      reviews: grade >= 3 ? 1 : 0,
      dueAt: addDays(interval),
      lastReview: today,
    };
  }

  D = D ?? 5;

  // ── Lapse (Again) ────────────────────────────────────────────────────────
  if (grade === 1) {
    // Each lapse deepens the stability penalty; floor at 0.4 days
    const newS = Math.max(0.4, S * 0.5 * Math.pow(0.9, L));
    const newD = Math.min(10, D + 1.0);
    return {
      stability: newS,
      difficulty: newD,
      lapses: L + 1,
      reviews: word.reviews ?? 0,
      dueAt: addDays(1),
      lastReview: today,
    };
  }

  // ── Recall (Hard / Good / Easy) ──────────────────────────────────────────
  const t = daysBetween(word.lastReview ?? today, today);
  const r = Math.exp(-t / Math.max(0.1, S));        // retrievability at review time
  const gFactor = grade === 2 ? 1.06 : grade === 3 ? 1.22 : 1.50;  // grade growth factor
  const dFactor = (11 - D) / 6;                     // D=1 → 1.67×, D=5 → 1×, D=10 → 0.17×
  const rBonus  = Math.exp(0.3 * (1 - r));          // bonus stability growth when overdue
  const newS    = S * gFactor * dFactor * rBonus;

  const dDelta  = -0.7 * (grade - 3);               // Hard→+0.7, Good→0, Easy→−0.7
  const newD    = Math.max(1, Math.min(10, D + dDelta));
  const interval = Math.max(1, Math.round(newS));

  return {
    stability: newS,
    difficulty: newD,
    lapses: L,
    reviews: (word.reviews ?? 0) + 1,
    dueAt: addDays(interval),
    lastReview: today,
  };
}

/** How many days until next review for the given grade (for UI interval preview). */
export function fsrsNextInterval(word: DeckWord, grade: FsrsGrade): number {
  const result = fsrsSchedule(word, grade);
  if (!result.dueAt) return 1;
  const today = new Date().toISOString().slice(0, 10);
  return Math.max(1, daysBetween(today, result.dueAt));
}

/** Format a day count as a compact human label: "1 day", "5 days", "3 wks", "2 mo". */
export function fmtInterval(days: number): string {
  if (days <= 1) return '1 day';
  if (days < 14)  return `${days} days`;
  if (days < 60)  return `${Math.round(days / 7)} wks`;
  return `${Math.round(days / 30)} mo`;
}
