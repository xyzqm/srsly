/**
 * FSRS v4.5 scheduler with learning phase.
 *
 * Learning steps: [1 min, 10 min]
 *   Again  → reset to step 0, 1 min
 *   Hard   → stay at current step, 5 min (fixed)
 *   Good   → advance step; graduate from step 1
 *   Easy   → graduate immediately
 *
 * Review phase uses the standard FSRS-4.5 formulas with 19 default weights.
 * Retrievability: R(t, S) = (1 + FACTOR * t/S)^DECAY  where R=0.9 at t=S.
 */
import type { DeckWord } from './types';

export type FsrsGrade = 1 | 2 | 3 | 4; // 1=Again 2=Hard 3=Good 4=Easy

// ── Settings ─────────────────────────────────────────────────────────────────

export interface SrsSettings {
  desiredRetention: number; // 0.70–0.99
  maxIntervalDays: number;
  newPerDay: number;        // max new cards introduced per day
  reviewsPerDay: number;    // max review cards shown per day
}

export const DEFAULT_SRS_SETTINGS: SrsSettings = {
  desiredRetention: 0.90,
  maxIntervalDays: 365,
  newPerDay: 20,
  reviewsPerDay: 200,
};

/** Lapse count at which a word is auto-flagged as a leech (and auto-paused). */
export const LEECH_THRESHOLD = 8;

export function getSrsSettings(): SrsSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SRS_SETTINGS;
  try {
    const prefs = JSON.parse(localStorage.getItem('srsly-prefs') ?? '{}');
    return {
      desiredRetention: Number(prefs.srsRetention) || DEFAULT_SRS_SETTINGS.desiredRetention,
      maxIntervalDays:  Number(prefs.srsMaxDays)   || DEFAULT_SRS_SETTINGS.maxIntervalDays,
      newPerDay:     Number.isFinite(+prefs.srsNewPerDay)     ? Number(prefs.srsNewPerDay)     : DEFAULT_SRS_SETTINGS.newPerDay,
      reviewsPerDay: Number.isFinite(+prefs.srsReviewsPerDay) ? Number(prefs.srsReviewsPerDay) : DEFAULT_SRS_SETTINGS.reviewsPerDay,
    };
  } catch {
    return DEFAULT_SRS_SETTINGS;
  }
}

// ── FSRS-4.5 weights (19 parameters, 0-indexed) ──────────────────────────────

const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589,
  1.5330, 0.1544, 1.0071, 1.9395, 0.1100, 0.2900, 2.2700, 0.2900,
  2.9898, 0.5100, 0.4300,
];

// R(t,S) = (1 + FACTOR*t/S)^DECAY — equals 0.9 when t=S
const DECAY  = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // 19/81 ≈ 0.2346

// ── Math helpers ─────────────────────────────────────────────────────────────

function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

function nextInterval(stability: number, desiredRetention: number, maxDays: number): number {
  // Derived by solving R(I,S)=desiredRetention for I
  const days = (stability / FACTOR) * (Math.pow(desiredRetention, 1 / DECAY) - 1);
  return Math.max(1, Math.min(maxDays, Math.round(days)));
}

/**
 * Anki-style interval fuzz: nudges a multi-day interval by a small random amount so
 * cards introduced together and graded the same don't all resurface on the same day.
 * Applied only when actually scheduling — the preview/answer-button intervals show the
 * un-fuzzed value (as in Anki). No fuzz on short intervals (time-critical learning).
 */
function applyFuzz(ivl: number): number {
  if (ivl < 2.5) return ivl;
  const pct = ivl < 7 ? 0.25 : ivl < 20 ? 0.15 : 0.05;
  const delta = Math.max(1, Math.round(ivl * pct));
  return Math.max(1, ivl + Math.round((Math.random() * 2 - 1) * delta));
}

function initStability(rating: FsrsGrade): number {
  return Math.max(0.1, W[rating - 1]);
}

function initDifficulty(rating: FsrsGrade): number {
  return Math.max(1, Math.min(10, W[4] - Math.exp(W[5] * (rating - 1)) + 1));
}

function updateDifficulty(d: number, rating: FsrsGrade): number {
  const d0Easy = W[4] - Math.exp(W[5] * 3) + 1; // D0 for grade 4 (Easy)
  const shifted = d - W[6] * (rating - 3);
  const reverted = W[7] * d0Easy + (1 - W[7]) * shifted; // mean-revert toward Easy baseline
  return Math.max(1, Math.min(10, reverted));
}

function updateStabilityPass(d: number, s: number, r: number, rating: FsrsGrade): number {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus   = rating === 4 ? W[16] : 1;
  const newS = s * (
    Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1)
    * hardPenalty * easyBonus + 1
  );
  return Math.max(0.1, newS);
}

function updateStabilityFail(d: number, s: number, r: number): number {
  return Math.max(
    0.1,
    W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]),
  );
}

// ── Learning phase ────────────────────────────────────────────────────────────

// Step intervals in minutes; Hard bypasses these and uses HARD_MIN
const LEARNING_STEPS_MIN = [1, 10] as const;
const HARD_MIN = 5; // Hard in learning is always 5 min regardless of step

// ── Utility ──────────────────────────────────────────────────────────────────

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

/** True when a card is in the learning/relearning phase. */
export function isLearningCard(word: DeckWord): boolean {
  return word.phase === 'learning' || (word.phase === undefined && word.stability === undefined);
}

// ── Core scheduler ────────────────────────────────────────────────────────────

export function fsrsSchedule(
  word: DeckWord,
  grade: FsrsGrade,
  settings: SrsSettings = DEFAULT_SRS_SETTINGS,
  opts: { fuzz?: boolean } = {},
): Partial<DeckWord> {
  const today  = new Date().toISOString().slice(0, 10);
  const nowMs  = Date.now();
  const step   = word.learningStep ?? 0;
  const lapses = word.lapses ?? 0;
  // Fuzz only when persisting a real grade; previews (fsrsNextInterval) leave it off
  // so the answer-button labels stay stable.
  const fz = (ivl: number) => (opts.fuzz ? applyFuzz(ivl) : ivl);

  // ── Learning / relearning ─────────────────────────────────────────────────
  if (isLearningCard(word)) {

    if (grade === 4) {
      // Easy: skip steps, graduate immediately with initial Easy stability
      const s = initStability(4);
      const d = initDifficulty(4);
      return {
        stability: s, difficulty: d, lapses,
        reviews: (word.reviews ?? 0) + 1,
        phase: 'review', learningStep: undefined, dueAtMs: undefined,
        dueAt: addDays(fz(nextInterval(s, settings.desiredRetention, settings.maxIntervalDays))),
        lastReview: today,
      };
    }

    if (grade === 1) {
      // Again: reset to step 0, show again in 1 min
      return {
        phase: 'learning', learningStep: 0,
        dueAtMs: nowMs + LEARNING_STEPS_MIN[0] * 60_000,
        dueAt: today, lapses: lapses + 1,
        reviews: word.reviews ?? 0, lastReview: today,
      };
    }

    if (grade === 2) {
      // Hard: keep current step, always 5 min (regardless of step)
      return {
        phase: 'learning', learningStep: step,
        dueAtMs: nowMs + HARD_MIN * 60_000,
        dueAt: today, lastReview: today,
      };
    }

    // Good: advance step, graduate from step 1
    const nextStep = step + 1;
    if (nextStep >= LEARNING_STEPS_MIN.length) {
      // Graduate — use preserved stability for relapsed cards, else initial Good stability
      const s = word.stability ?? initStability(3);
      const d = word.difficulty ?? initDifficulty(3);
      return {
        stability: s, difficulty: d, lapses,
        reviews: (word.reviews ?? 0) + 1,
        phase: 'review', learningStep: undefined, dueAtMs: undefined,
        dueAt: addDays(fz(nextInterval(s, settings.desiredRetention, settings.maxIntervalDays))),
        lastReview: today,
      };
    }

    // Advance to next step (step 0 → step 1 = 10 min)
    return {
      phase: 'learning', learningStep: nextStep,
      dueAtMs: nowMs + LEARNING_STEPS_MIN[nextStep] * 60_000,
      dueAt: today, lastReview: today,
    };
  }

  // ── Review phase ──────────────────────────────────────────────────────────

  let S = word.stability;
  let D = word.difficulty;

  // One-time migration bootstrap for old cards without stability
  if (S === undefined) {
    const rev = word.reviews ?? 0;
    if (rev > 0) {
      S = [1, 3, 7, 14, 30, 60][Math.min(rev, 5)];
      D = Math.max(1, Math.min(10, 6 - Math.round(rev / 2)));
    }
  }

  if (S === undefined) {
    // Shouldn't reach here for phase='review', but handle gracefully
    const s = initStability(grade);
    return {
      stability: s, difficulty: initDifficulty(grade),
      lapses: grade === 1 ? 1 : 0, reviews: 1,
      phase: 'review',
      dueAt: addDays(fz(nextInterval(s, settings.desiredRetention, settings.maxIntervalDays))),
      lastReview: today,
    };
  }

  D = D ?? 5;
  const t = daysBetween(word.lastReview ?? today, today);
  const r = retrievability(t, S);

  if (grade === 1) {
    // Lapse: back to learning with reduced stability
    const newS = updateStabilityFail(D, S, r);
    const newD = updateDifficulty(D, 1);
    return {
      stability: newS, difficulty: newD,
      lapses: lapses + 1, reviews: word.reviews ?? 0,
      phase: 'learning', learningStep: 0,
      dueAtMs: nowMs + LEARNING_STEPS_MIN[0] * 60_000,
      dueAt: today, lastReview: today,
    };
  }

  const newS = updateStabilityPass(D, S, r, grade);
  const newD = updateDifficulty(D, grade);
  return {
    stability: newS, difficulty: newD,
    lapses, reviews: (word.reviews ?? 0) + 1,
    phase: 'review', dueAtMs: undefined,
    dueAt: addDays(fz(nextInterval(newS, settings.desiredRetention, settings.maxIntervalDays))),
    lastReview: today,
  };
}

// ── Preview helpers ───────────────────────────────────────────────────────────

/**
 * Returns fractional days until next review for each grade.
 * Values < 1 represent sub-day intervals:
 *   1/1440 ≈ 0.000694 = 1 min
 */
export function fsrsNextInterval(
  word: DeckWord,
  grade: FsrsGrade,
  settings: SrsSettings = DEFAULT_SRS_SETTINGS,
): number {
  const result = fsrsSchedule(word, grade, settings);
  const today  = new Date().toISOString().slice(0, 10);

  if (result.phase !== 'review' && result.dueAtMs !== undefined) {
    const msFromNow = (result.dueAtMs as number) - Date.now();
    return Math.max(1 / 1440, msFromNow / 86_400_000);
  }
  if (!result.dueAt) return 1;
  return Math.max(1, daysBetween(today, result.dueAt as string));
}

// ── Display ───────────────────────────────────────────────────────────────────

export function fmtInterval(days: number): string {
  if (days < 1 / 24) {
    const m = Math.round(days * 24 * 60);
    return `${Math.max(1, m)} min`;
  }
  if (days < 1)  return `${Math.round(days * 24)} hr`;
  if (days <= 1) return '1 day';
  if (days < 14) return `${Math.round(days)} days`;
  if (days < 60) return `${Math.round(days / 7)} wks`;
  return `${Math.round(days / 30)} mo`;
}
