import { fsrs, generatorParameters, createEmptyCard, State, type Grade } from 'ts-fsrs';
import type { DeckWord } from './types';
import { dayOffset } from './deck';

// SRS scheduling backed by the ts-fsrs library (open-spaced-repetition). Because DeckWord
// extends ts-fsrs's Card (see types.ts), there's no DeckWord<->Card conversion: a DeckWord is
// a valid Card, and grading just merges the scheduler's returned Card fields back onto it.

export type FsrsGrade = 1 | 2 | 3 | 4; // 1=Again 2=Hard 3=Good 4=Easy — matches ts-fsrs Rating

export interface SrsSettings {
  desiredRetention: number; // 0.70–0.99
  maxIntervalDays: number;
}
export const DEFAULT_SRS_SETTINGS: SrsSettings = { desiredRetention: 0.95, maxIntervalDays: 365 };

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
      // Disables ts-fsrs's sub-day (re)learning steps, so every grade — even a same-session
      // "Again" — reschedules at least a full day out instead of minutes later.
      enable_short_term: false,
    }),
  );
}

/** A fresh, unscheduled card (state New, due now) carrying the given identity fields. No `id` —
 *  that's assigned by Postgres when the card is inserted into `deck_words`. */
export function newCard(fields: Partial<Omit<DeckWord, 'id'>> & { h: string; p: string; m: string }): Omit<DeckWord, 'id'> {
  return { ...createEmptyCard(new Date()), ...fields };
}

/** Normalize a DeckWord row loaded from Supabase: `due`/`last_review` come back as ISO
 *  timestamp strings, so turn them back into Dates here. */
export function reviveCard(raw: DeckWord): DeckWord {
  const r = raw as unknown as Record<string, unknown>;
  return {
    ...raw,
    due: new Date(r.due as string),
    last_review: r.last_review != null ? new Date(r.last_review as string) : undefined,
  };
}

/** Has this card never been reviewed? */
export function isNew(w: DeckWord): boolean {
  return w.state === State.New;
}

/** Grade a card (1=Again…4=Easy) and return the updated card. ts-fsrs does the scheduling;
 *  we merge its returned Card fields back onto the DeckWord, preserving h/p/m/decks/etc.
 *
 *  A word's very first review (state New) always comes back in exactly one day (i.e. first grade is always Again)
 *  — FSRS's own initial-stability curve would otherwise send a first "Good" out several
 *  days while a first "Again" comes back in one, and a word that's never been seen once doesn't
 *  carry enough signal to trust that spread. `stability`/`difficulty` still get FSRS's real
 *  values, so every *subsequent* review schedules normally. */
export function gradeWord(word: DeckWord, grade: FsrsGrade, settings: SrsSettings = DEFAULT_SRS_SETTINGS): DeckWord {
  const { card } = schedulerFor(settings).next(word, new Date(), (word.state === State.New ? 1 : grade) as Grade);
  return { ...word, ...card };
}
