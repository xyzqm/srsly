import type { PassageToken } from './types';

/**
 * How much of a text is vocabulary you have already been calibrated against.
 *
 * ── WHY THIS IS ALLOWED TO EXIST ──
 * This file's position is that levels are calibration and a MAP, not the goal. A readability
 * figure is exactly that map: it answers "is this book written near where I am?", which is the
 * question standing between a learner and the novel they actually want to read. It must never
 * become a gate — nothing here blocks opening anything, and the number is reported next to the
 * text rather than in front of it.
 *
 * ── IT READS TOKENS, NOT RAW TEXT ──
 * Every segmenter in this app is server-side (lib/server/*Segmenter.ts), so there is nothing on
 * the client that can turn a string into words; and the level tables are keyed by LEMMA, so
 * matching raw surface forms would count `parlons`, `maisons` and every other inflection as
 * unknown and score a wholly-A1 French text at about 40%. Both problems disappear by measuring
 * the tokens the segmenter already produced: they carry `baseForm` and `meaning` already, so
 * this is exact and costs nothing.
 */

/** `Record<level, words[]>` as emitted by the level tables. */
export type LevelBands = Record<number, string[]>;

export interface HardWord {
  /** The dictionary form, as it would be looked up. */
  word: string;
  /** How many times it occurs in this text. */
  count: number;
  /** Its band, or 0 when it is in none. */
  level: number;
}

export interface Readability {
  /** Word tokens measured — punctuation and unresolvable tokens excluded. */
  tokens: number;
  /** Distinct dictionary forms among them. */
  types: number;
  /** Share of measured tokens at or below `level`, 0–1. */
  coverage: number;
  /** Measured token counts per band. Key 0 is "in no band at all". */
  byLevel: Record<number, number>;
  /** The band this was measured against. */
  level: number;
  /**
   * Tokens the dictionary could not define, excluded from `coverage` entirely.
   *
   * Two kinds, both of which would lie if graded:
   *
   * - PROPER NOUNS. Filtered out of the dictionaries at build time (scripts/lib/nameFilter.mjs),
   *   so a novel's characters resolve to nothing. Counting them as hard words makes every novel
   *   look far above its real level; counting them as known would be a lie.
   * - UNDECOMPOSED ELISIONS. `j'aime` is `je` + `aime`, both of them A1, but it survives as one
   *   token because it is its own dictionary headword — so it is in no band, and grading it put
   *   "j'aime" at the top of a beginner chapter's list of hardest words. It is not a vocabulary
   *   item at all; it is two words glued together.
   */
  unresolved: number;
  /** The commonest words above the level — what would actually slow you down. */
  hardest: HardWord[];
}

/** Word → band, from the emitted level tables. Build once and reuse across chapters. */
export function buildLevelIndex(bands: LevelBands): Map<string, number> {
  const index = new Map<string, number>();
  for (const [level, words] of Object.entries(bands)) {
    const n = Number(level);
    // Lower bands win: a word listed twice belongs to the easiest band that claims it.
    for (const w of words) if (!index.has(w)) index.set(w, n);
  }
  return index;
}

/**
 * Below this, a percentage is noise rather than a measurement — a six-word caption can only
 * ever be 0%, 50% or 100%. Callers should not render a figure for a shorter text.
 */
export const MIN_TOKENS = 30;

/** How many of the hardest words are worth naming. More than this is a vocabulary list. */
const HARDEST_SHOWN = 5;

/**
 * Measure a text against a level band.
 *
 * ── TOKEN-WEIGHTED, NOT TYPE-WEIGHTED ──
 * Coverage counts every occurrence, not every distinct word. The question is "what share of the
 * words on this page do I know?", and by types a rare word appearing once would weigh the same
 * as `le` appearing forty times — which reads as a much harder text than it is. Distinct forms
 * are still reported as `types`, because the two together say something neither says alone: a
 * high token coverage with a large type count is a text with many one-off hard words, which is
 * exactly the text a dictionary makes readable.
 */
export function calculateReadability(
  tokens: PassageToken[],
  index: Map<string, number>,
  level: number,
): Readability {
  const counts = new Map<string, number>();
  const byLevel: Record<number, number> = {};
  let measured = 0;
  let known = 0;
  let unresolved = 0;

  for (const t of tokens) {
    if (t.type === 'punct') continue;
    const form = (t.baseForm ?? t.text).trim().toLowerCase();
    if (!form) continue;
    // No definition anywhere means the app cannot call it vocabulary — see `unresolved`.
    if (!t.meaning) { unresolved++; continue; }
    // An elision the lemmatizer could not split is not one word, so it has no one level.
    if (/['\u2019]/.test(form) && !index.has(form)) { unresolved++; continue; }

    measured++;
    counts.set(form, (counts.get(form) ?? 0) + 1);
    const band = index.get(form) ?? 0;
    byLevel[band] = (byLevel[band] ?? 0) + 1;
    if (band > 0 && band <= level) known++;
  }

  const hardest: HardWord[] = [...counts.entries()]
    .map(([word, count]) => ({ word, count, level: index.get(word) ?? 0 }))
    .filter(w => w.level === 0 || w.level > level)
    // Commonest first: a hard word you meet six times costs more than six you meet once.
    // Ties break on the harder band, and then alphabetically so the list is stable.
    .sort((a, b) => b.count - a.count || b.level - a.level || (a.word < b.word ? -1 : 1))
    .slice(0, HARDEST_SHOWN);

  return {
    tokens: measured,
    types: counts.size,
    coverage: measured ? known / measured : 0,
    byLevel,
    level,
    unresolved,
    hardest,
  };
}

/**
 * Excerpts spread through a book, for an estimate rather than an exact count.
 *
 * `/api/segment-text` caps at MAX_PASTE_CHARS, so scoring a novel exactly means one request per
 * chapter — thirty-plus round trips and a visible wait before the learner has decided whether
 * they even want the book. Three excerpts spread across the middle of the book answer the same
 * question closely enough, and the UI says "estimated" rather than implying a full count.
 *
 * The first and last chapters are avoided where possible: front matter and appendices are not
 * representative prose, and `epub.ts` already lets short ones through as real chapters.
 */
export function sampleChapters(chapters: string[], samples = 3, chars = 4000): string[] {
  const usable = chapters
    .map((text, i) => ({ text: text.trim(), i }))
    .filter(c => c.text.length >= 400);
  if (!usable.length) return [];

  const pool = usable.length > samples + 1 ? usable.slice(1) : usable;
  const out: string[] = [];
  for (let s = 0; s < Math.min(samples, pool.length); s++) {
    // Spread the picks evenly rather than taking the first N, so a book that opens easily and
    // gets harder is not scored on its opening alone.
    const pick = pool[Math.floor(((s + 0.5) / Math.min(samples, pool.length)) * pool.length)];
    if (pick && !out.includes(pick.text)) out.push(pick.text.slice(0, chars));
  }
  return out;
}
