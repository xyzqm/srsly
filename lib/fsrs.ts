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
import { todayStr, dateInDays } from './deck';

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

/**
 * Default batch size for the Vocab tab's "Activate from pool" button.
 *
 * Ten is a day's worth of genuinely new material for most people and sits comfortably under
 * the default 20 new cards/day, so a batch activated today is one you can actually start
 * today rather than one that queues up behind the limit.
 */
export const RECOMMENDED_POOL_ACTIVATE = 10;
/** Past this, a single activation is more new words than a day of study can absorb. */
export const HIGH_POOL_ACTIVATE = 50;

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

// Step intervals in minutes. Hard advances a step like Good but uses HARD_MIN for the gap.
const LEARNING_STEPS_MIN = [1, 10] as const;
const HARD_MIN = 5;

// ── Utility ──────────────────────────────────────────────────────────────────

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
  const today  = todayStr();
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
        dueAt: dateInDays(fz(nextInterval(s, settings.desiredRetention, settings.maxIntervalDays))),
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

    // Good and Hard both ADVANCE a step. Hard differs by coming back sooner (5 min rather
    // than the step's own gap) and by graduating on its own lower initial stability.
    //
    // Hard used to repeat the current step instead. That is what Anki does, and it was
    // harmless while a re-queued card came straight back round — you pressed Good eventually
    // and moved on. Now that the queue actually honours `dueAtMs`, repeating the step is a
    // dead end: a learner answering Hard honestly gets a 5:00 countdown, forever, with
    // `stability` pinned at 0 and `reviews` never incrementing, so the card is permanently
    // new and never reaches the review phase where the FSRS growth curve lives.
    const nextStep = step + 1;
    if (nextStep < LEARNING_STEPS_MIN.length) {
      return {
        phase: 'learning', learningStep: nextStep,
        dueAtMs: nowMs + (grade === 2 ? HARD_MIN : LEARNING_STEPS_MIN[nextStep]) * 60_000,
        dueAt: today, lastReview: today,
      };
    }

    // Graduate. A relapsed card keeps the stability it already earned; a fresh one starts
    // from this grade's own initial value, which is where Hard stays harder than Good —
    // ~1 day out against ~2, and a slower curve from there.
    const s = word.stability ?? initStability(grade);
    const d = word.difficulty ?? initDifficulty(grade);
    return {
      stability: s, difficulty: d, lapses,
      reviews: (word.reviews ?? 0) + 1,
      phase: 'review', learningStep: undefined, dueAtMs: undefined,
      dueAt: dateInDays(fz(nextInterval(s, settings.desiredRetention, settings.maxIntervalDays))),
      lastReview: today,
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
      dueAt: dateInDays(fz(nextInterval(s, settings.desiredRetention, settings.maxIntervalDays))),
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
    dueAt: dateInDays(fz(nextInterval(newS, settings.desiredRetention, settings.maxIntervalDays))),
    lastReview: today,
  };
}

// ── Preview helpers ───────────────────────────────────────────────────────────

/**
 * Returns fractional days until next review for each grade.
 * Values < 1 represent sub-day intervals:
 *   1/1440 ≈ 0.000694 = 1 min
 *
 * `minDaysOut` mirrors the identically-named option on `gradeCard`/`updateWordReview`: pass
 * the same value the caller will persist with, and the preview follows the same rule. It
 * floors a graduated card to that many days out and — exactly as the persist path does —
 * leaves a learning card's step alone.
 *
 * It is still a FORECAST, not the stored date: fuzz is applied only when persisting a real
 * grade (see the `fz` helper), so a card previewed at 4 days can land on 3 or 5. That
 * scatter is the point of fuzz, and quoting the un-fuzzed number is what Anki shows too.
 *
 * Reading used to floor this at the call site with `Math.max(1, …)`, which is not the same
 * rule: it swallowed every learning step too, so a word met in a passage reported "review in
 * 1 day" when it was really coming back in ten minutes. That is why the results list read as
 * though every missed word had been given the same interval.
 */
export function fsrsNextInterval(
  word: DeckWord,
  grade: FsrsGrade,
  settings: SrsSettings = DEFAULT_SRS_SETTINGS,
  opts?: { minDaysOut?: number },
): number {
  const result = fsrsSchedule(word, grade, settings);
  const today  = todayStr();

  if (result.phase !== 'review' && result.dueAtMs !== undefined) {
    const msFromNow = (result.dueAtMs as number) - Date.now();
    return Math.max(1 / 1440, msFromNow / 86_400_000);
  }
  if (!result.dueAt) return 1;
  const days = Math.max(1, daysBetween(today, result.dueAt as string));
  return opts?.minDaysOut ? Math.max(opts.minDaysOut, days) : days;
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
