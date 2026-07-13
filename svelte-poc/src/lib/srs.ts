import { fsrs, generatorParameters, createEmptyCard, State, type Grade } from 'ts-fsrs';
import type { DeckWord } from './types';

// SRS scheduling backed by the ts-fsrs library (open-spaced-repetition). Because DeckWord
// extends ts-fsrs's Card (see types.ts), there's no DeckWord<->Card conversion: a DeckWord is
// a valid Card, and grading just merges the scheduler's returned Card fields back onto it.

export type FsrsGrade = 1 | 2 | 3 | 4; // 1=Again 2=Hard 3=Good 4=Easy — matches ts-fsrs Rating

export interface SrsSettings {
  desiredRetention: number; // 0.70–0.99
  maxIntervalDays: number;
}
export const DEFAULT_SRS_SETTINGS: SrsSettings = { desiredRetention: 0.9, maxIntervalDays: 365 };

/** Read desired retention / max interval from prefs. */
export function getSrsSettings(): SrsSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SRS_SETTINGS;
  try {
    const prefs = JSON.parse(localStorage.getItem('srsly-prefs') ?? '{}');
    return {
      desiredRetention: Number(prefs.srsRetention) || DEFAULT_SRS_SETTINGS.desiredRetention,
      maxIntervalDays: Number(prefs.srsMaxDays) || DEFAULT_SRS_SETTINGS.maxIntervalDays,
    };
  } catch {
    return DEFAULT_SRS_SETTINGS;
  }
}

function schedulerFor(s: SrsSettings) {
  return fsrs(
    generatorParameters({
      request_retention: s.desiredRetention,
      maximum_interval: s.maxIntervalDays,
      enable_fuzz: true,
      learning_steps: ['1m', '10m'], // matches srsly's original learning steps
    }),
  );
}

/** A fresh, unscheduled card (state New, due now) carrying the given identity fields. */
export function newCard(fields: Partial<DeckWord> & { h: string; p: string; m: string }): DeckWord {
  return { ...createEmptyCard(new Date()), ...fields };
}

/**
 * Normalize a DeckWord loaded from localStorage. JSON turns Card's `due`/`last_review` Dates
 * into ISO strings, so revive them here. Also migrates the pre-Card on-disk shape (dueAt /
 * reviews / phase / …) one time, so older saved decks keep working.
 */
export function reviveCard(raw: DeckWord): DeckWord {
  const r = raw as unknown as Record<string, unknown>;
  if (r.due != null) {
    // Current shape — just turn the serialized dates back into Date objects.
    return {
      ...raw,
      due: new Date(r.due as string),
      last_review: r.last_review != null ? new Date(r.last_review as string) : undefined,
    };
  }
  // Legacy shape → map the old scheduling fields onto a fresh Card.
  const base = createEmptyCard(new Date());
  if (r.dueAt) base.due = new Date(`${r.dueAt as string}T00:00:00`);
  if (r.lastReview) base.last_review = new Date(`${r.lastReview as string}T00:00:00`);
  base.reps = (r.reviews as number) ?? 0;
  base.stability = (r.stability as number) ?? base.stability;
  base.difficulty = (r.difficulty as number) ?? base.difficulty;
  base.lapses = (r.lapses as number) ?? 0;
  base.learning_steps = (r.learningStep as number) ?? 0;
  base.state = r.phase === 'review' ? State.Review : r.phase === 'learning' ? State.Learning : base.state;
  const { h, p, m, pool } = raw;
  return { ...base, h, p, m, pool };
}

/** Has this card never been reviewed? */
export function isNew(w: DeckWord): boolean {
  return w.state === State.New;
}

/** Grade a card (1=Again…4=Easy) and return the updated card. ts-fsrs does the scheduling;
 *  we merge its returned Card fields back onto the DeckWord, preserving h/p/m/decks/etc. */
export function gradeWord(word: DeckWord, grade: FsrsGrade, settings: SrsSettings = DEFAULT_SRS_SETTINGS): DeckWord {
  const { card } = schedulerFor(settings).next(word, new Date(), grade as Grade);
  return { ...word, ...card };
}
