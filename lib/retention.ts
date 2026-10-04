import type { DeckWord } from '@/lib/types';
import { isActive, todayStr } from '@/lib/deck';
import { retrievability, getSrsSettings, daysBetween, type SrsSettings } from '@/lib/fsrs';

/**
 * WHAT FSRS CURRENTLY BELIEVES ABOUT THE WHOLE DECK — derived on read, stored nowhere.
 *
 * The Vocab tab already answers "why is THIS card due?" through `cardInsight`, one card at a
 * time. Nothing answered the deck-wide version: how durable is what I have, how much of it
 * would survive a week away, and which cards are already slipping. Those are the questions a
 * scheduler exists to answer and the app has never shown them.
 *
 * ── NOTHING IS STORED, AND THAT IS THE POINT ──
 *
 * Every figure here is a function of `stability`, `difficulty` and `lastReview`, which the
 * deck already carries because FSRS needs them. No column, no migration, no second record of
 * a fact — the rule lib/achievements.ts and lib/yearInReading.ts already follow.
 *
 * ── AND IT REFUSES THE ONE NUMBER EVERYBODY WANTS ──
 *
 * **TRUE RETENTION IS NOT IN HERE AND CANNOT BE.** "Of the cards FSRS put at 90%, how many did
 * I actually recall?" needs the outcome of each review paired with the probability predicted
 * at that moment, and `DeckWord` keeps only CURRENT state — the next review overwrites both.
 * Everything below is the model's own PREDICTION, which is worth showing and is not evidence
 * that the model is calibrated. Saying so is the difference between a dashboard and a mirror.
 * Measuring it needs a stored review log; that is deliberately a separate decision.
 *
 * ── A CARD WITH NO MODEL IS SKIPPED, NOT COUNTED AS ZERO ──
 *
 * `cardInsight` returns null for a new or still-learning card and says why: "there is no
 * honest curve to describe before the first graduation, and inventing one would be worse than
 * saying nothing." Averaging those in as 0 would make a deck of fresh cards look like total
 * amnesia; averaging them in as 1 would flatter it. They are excluded and COUNTED, so the
 * panel can say what it left out.
 */

/** Below this many modelled cards the figures are noise, and the panel renders nothing. */
export const MIN_MODELLED = 12;

/** How far ahead the decay curve looks. Four weeks is long enough to show the shape. */
export const DECAY_DAYS = 28;

/** At most this many at-risk cards are named; the rest are counted. */
export const AT_RISK_SHOWN = 6;

/**
 * Stability bands, in days, labelled the way a person thinks about them.
 *
 * Boundaries are at the units people actually use rather than at round numbers — a card you
 * would remember "about a week" and one you would remember "about a month" are different
 * kinds of knowing, and a linear axis would put 95% of a healthy deck in one bar.
 */
export const STABILITY_BANDS: { label: string; max: number }[] = [
  { label: '<1d', max: 1 },
  { label: '1–7d', max: 7 },
  { label: '1–4w', max: 30 },
  { label: '1–3m', max: 90 },
  { label: '3–12m', max: 365 },
  { label: '1y+', max: Infinity },
];

export interface AtRiskCard {
  id: string;
  h: string;
  p: string;
  m: string;
  /** Predicted recall right now, 0–1. */
  recall: number;
  /** Days since the last review. */
  daysSince: number;
}

export interface StabilityBand {
  label: string;
  count: number;
}

export interface DecayPoint {
  /** Days from today. */
  day: number;
  /** Mean predicted recall across modelled cards if nothing is reviewed. */
  recall: number;
}

export interface RetentionSummary {
  /** Cards FSRS has a model of — graduated, with a stability and a last review. */
  modelled: number;
  /** Active cards with no model yet (new, or still in learning steps). */
  unmodelled: number;
  /** Mean predicted recall across modelled cards, today. */
  recallToday: number;
  /** 1 − recallToday. The same fact, said the way a learner asks it. */
  forgettingIndex: number;
  /** What the schedule is aiming at, from settings. */
  target: number;
  /** Median stability in days — median rather than mean, see the note in `summarise`. */
  medianStability: number;
  bands: StabilityBand[];
  decay: DecayPoint[];
  atRisk: AtRiskCard[];
  /** How many cards are below target, of which `atRisk` names at most AT_RISK_SHOWN. */
  atRiskTotal: number;
  /** True when there is too little modelled history to say anything. */
  sparse: boolean;
}

/** A card FSRS can model: graduated, with a stability and a review behind it. */
function modelOf(w: DeckWord, today: string): { s: number; elapsed: number } | null {
  if (w.phase === 'learning') return null;
  if (w.stability === undefined || w.stability <= 0) return null;
  if (!w.lastReview) return null;
  return { s: w.stability, elapsed: Math.max(0, daysBetween(w.lastReview, today)) };
}

/**
 * The whole panel, from a deck.
 *
 * `deck` of `[]` is a real answer ("no cards"); `null` is "not loaded yet" and is the
 * caller's to distinguish — this file never sees it, the same split `YearInReading` makes.
 */
export function summarise(
  deck: DeckWord[],
  settings: SrsSettings = getSrsSettings(),
  today: string = todayStr(),
): RetentionSummary {
  // Pooled, paused and snoozed cards are excluded through the same `isActive` the queues use,
  // so this cannot describe memory the app will never test. Same rule FutureLoad states.
  const active = deck.filter(w => isActive(w, today));

  const models: { w: DeckWord; s: number; elapsed: number }[] = [];
  for (const w of active) {
    const m = modelOf(w, today);
    if (m) models.push({ w, s: m.s, elapsed: m.elapsed });
  }

  const modelled = models.length;
  const unmodelled = active.length - modelled;
  const target = settings.desiredRetention;

  if (modelled < MIN_MODELLED) {
    return {
      modelled, unmodelled, recallToday: 0, forgettingIndex: 0, target,
      medianStability: 0, bands: [], decay: [], atRisk: [], atRiskTotal: 0, sparse: true,
    };
  }

  const recalls = models.map(m => retrievability(m.elapsed, m.s));
  const recallToday = recalls.reduce((a, b) => a + b, 0) / modelled;

  /**
   * MEDIAN, NOT MEAN, and the asymmetry is the reason. Stability is unbounded above and
   * floored near zero, so a handful of cards at two years drags a mean far past anything the
   * deck actually looks like. The median is the card in the middle, which is what "how well
   * do I know this deck" means.
   */
  const sorted = models.map(m => m.s).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianStability = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const bands: StabilityBand[] = STABILITY_BANDS.map(b => ({ label: b.label, count: 0 }));
  for (const m of models) {
    const i = STABILITY_BANDS.findIndex(b => m.s < b.max);
    bands[i < 0 ? bands.length - 1 : i].count++;
  }

  /**
   * The decay curve: what the model says you would still recall on each of the next 28 days
   * IF YOU REVIEWED NOTHING. It is a counterfactual and the UI labels it as one — the whole
   * point of the app is that you do not do this.
   */
  const decay: DecayPoint[] = [];
  for (let d = 0; d <= DECAY_DAYS; d++) {
    let sum = 0;
    for (const m of models) sum += retrievability(m.elapsed + d, m.s);
    decay.push({ day: d, recall: sum / modelled });
  }

  /**
   * At risk: already below the retention the schedule is aiming at.
   *
   * Deliberately NOT the same as "due". A due card may still be comfortably above target
   * (intervals are rounded and fuzzed), and a card below target may not be due for days. This
   * is the question the due count cannot answer, which is why it earns its own list.
   */
  const below = models
    .filter(m => retrievability(m.elapsed, m.s) < target)
    .map(m => ({
      id: m.w.id ?? m.w.h,
      h: m.w.h,
      p: m.w.p,
      m: m.w.m,
      recall: retrievability(m.elapsed, m.s),
      daysSince: m.elapsed,
    }))
    .sort((a, b) => a.recall - b.recall);

  return {
    modelled,
    unmodelled,
    recallToday,
    forgettingIndex: 1 - recallToday,
    target,
    medianStability,
    bands,
    decay,
    atRisk: below.slice(0, AT_RISK_SHOWN),
    atRiskTotal: below.length,
    sparse: false,
  };
}

/** Days → a short human string. Mirrors `fmtInterval`'s bands without importing its 'min'/'hr'
 *  cases, which cannot arise here: a modelled card has graduated. */
export function fmtDays(days: number): string {
  if (days < 1) return '<1 day';
  if (days < 14) return `${Math.round(days)} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}
