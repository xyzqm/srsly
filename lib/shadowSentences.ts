import type { LanguageCode } from './types';

/**
 * The phrase-level material for shadowing, lifted from the Learn tab's practice sentences.
 *
 * ── WHY THIS DATA AND NOT THE DECK ──
 * Shadowing is about rhythm and intonation ACROSS A PHRASE: for Spanish and French the hard
 * parts — liaison, nasal vowels, where the stress lands in a group — do not exist inside one
 * word. The obvious source would be an example sentence on the card, and `DeckWord.cn` is even
 * declared as one. It is written NOWHERE in this repository: a dead field, read in two places
 * and never filled. `lib/data/lesson-practice.json` is the real corpus the project already
 * has — 69 sentences for zh and ja, 87 for es and fr, all WRITTEN for this app rather than
 * sourced, all already validated by `tests/lessons.test.ts` against the real segmenters.
 *
 * ── LAZY, BECAUSE `SrsTab` IS NOT ──
 * `app/page.tsx` imports `LearnTab` with `next/dynamic` and `SrsTab` STATICALLY, so the 36 kB
 * of lesson data currently rides in the Learn chunk and a plain import here would move it into
 * the initial bundle for every learner — including the ones who never open Shadow. Same
 * discipline, and the same `await import()`, as `loadFrGrammar` and `loadLevelTable`.
 *
 * ── EVERY SENTENCE, NOT ONLY THE FINISHED LESSONS ──
 * Filtering by `srsly-lessons-done` is the tempting version and it is wrong twice: it would
 * couple a drill that stores nothing to curriculum state it is firewalled from, and it would
 * hand a new learner an empty screen — the "nothing to practise" dead end this drill already
 * refuses by reading the whole deck rather than the due cards. Pronunciation practice has no
 * prerequisite; you can imitate a sentence you have not been taught.
 *
 * The lesson id travels so a later UI could say where a line came from. Nothing shows it yet,
 * and it costs a string.
 */

export interface ShadowSentence {
  /** What the reference voice says, and what is shown. */
  text: string;
  /** The English, so the learner is not imitating noise. */
  gloss: string;
  /** Which lesson it was written for. Carried, not yet displayed. */
  lesson: string;
}

type PracticeFile = Record<string, Record<string, { text: string; gloss: string; tiles: string[] }[]>>;

const cache = new Map<LanguageCode, ShadowSentence[]>();

/** Flatten one language's lessons into a flat list, in authored order. */
function flatten(file: PracticeFile, lang: LanguageCode): ShadowSentence[] {
  const byLesson = file[lang];
  if (!byLesson) return [];
  const out: ShadowSentence[] = [];
  for (const [lesson, rows] of Object.entries(byLesson)) {
    for (const r of rows) {
      // A row with no text could never be spoken, and an empty utterance would read as a
      // broken Reference button rather than as missing data.
      if (r?.text?.trim()) out.push({ text: r.text.trim(), gloss: r.gloss ?? '', lesson });
    }
  }
  return out;
}

/**
 * Load this language's sentences. Resolves to `[]` for a language with none — which is a real
 * answer and not a failure, and is why the caller distinguishes it from `null` (not loaded).
 */
export async function loadShadowSentences(lang: LanguageCode): Promise<ShadowSentence[]> {
  const hit = cache.get(lang);
  if (hit) return hit;
  try {
    const { LESSON_PRACTICE } = await import('./data/lesson-practice');
    const rows = flatten(LESSON_PRACTICE as PracticeFile, lang);
    cache.set(lang, rows);
    return rows;
  } catch {
    // The chunk failed to arrive. `[]` would say "this language has no sentences", which is a
    // different thing, so the caller gets the empty list only on a real answer — see above.
    return [];
  }
}

/** The already-loaded list, or null for "not asked yet". Pure, for tests and for a first frame. */
export function cachedShadowSentences(lang: LanguageCode): ShadowSentence[] | null {
  return cache.get(lang) ?? null;
}

/** Exported for `tests/shadowSentences.test.ts`, which runs it over the real file. */
export const __flattenForTest = flatten;
