import type { LanguageCode } from './types';

/**
 * Level tests — the way past a locked band without grinding to it.
 *
 * Two shapes, one engine:
 *
 *   PLACEMENT  runs a block per level from the easiest upward and stops at the first block
 *              you fail. That is a genuine diagnostic and it is short: a true beginner
 *              answers one block and is done, where a fixed test across every band would
 *              make them sit through five levels of words they have never seen.
 *   CHALLENGE  is one longer block on a single level, for skipping straight to it.
 *
 * Multiple choice from the app's own dictionaries, so a test costs no API call, works
 * offline, and can never invent a definition — the strict-dictionary rule that governs the
 * rest of the app holds here too. Distractors come from the SAME level, which is what keeps
 * the difficulty honest: picking them from anywhere would let "B2 word vs three A1 words"
 * be solved by register alone, without knowing the word.
 */

export interface TestQuestion {
  word: string;
  /** Deliberately NOT shown while answering — pinyin or furigana would give away a
   *  character you only half-recognise. Kept for the review screen afterwards. */
  reading: string;
  answer: string;
  options: string[];
  level: number;
}

export interface TestBlock {
  level: number;
  questions: TestQuestion[];
}

/** Share of a block that must be correct to pass it. */
export const PASS_MARK = 0.8;

/** Questions per block. Placement blocks are short because you may sit several. */
export const PLACEMENT_BLOCK = 6;
export const CHALLENGE_BLOCK = 15;

export function passingScore(questionCount: number): number {
  return Math.ceil(questionCount * PASS_MARK);
}

export type VocabTable = Record<string, { meaning: string; reading?: string; pinyin?: string }>;

/**
 * The first sense of a gloss.
 *
 * Glosses run several senses deep ("to want, to need; will, going to; important") and the
 * whole string is unreadable as a multiple-choice option — and worse, a long one is a
 * giveaway when the three distractors are short. The first `;` segment is the primary
 * sense, the same slice the CEFR-J anchor uses for the same reason.
 */
export function primarySense(gloss: string): string {
  const first = gloss.split(';')[0].trim();
  return first.length > 64 ? first.slice(0, 61).trimEnd() + '…' : first;
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build one block of questions for a level.
 *
 * Returns fewer than `count` — possibly none — when the level cannot supply enough words
 * with usable glosses. Callers must handle a short block rather than assume the count.
 */
export function buildBlock(
  level: number,
  levelWords: string[],
  vocab: VocabTable,
  count: number,
  rnd: () => number = Math.random,
): TestBlock {
  // Only words the dictionary can actually gloss, deduped by primary sense so a question
  // can never have two right answers among its options.
  const bySense = new Map<string, { word: string; sense: string; reading: string }>();
  for (const word of levelWords) {
    const entry = vocab[word];
    if (!entry?.meaning) continue;
    const sense = primarySense(entry.meaning);
    if (!sense || bySense.has(sense.toLowerCase())) continue;
    bySense.set(sense.toLowerCase(), { word, sense, reading: entry.reading ?? entry.pinyin ?? '' });
  }
  const pool = [...bySense.values()];
  if (pool.length < 4) return { level, questions: [] };

  const picked = shuffle(pool, rnd).slice(0, count);
  const questions = picked.map(p => {
    const distractors = shuffle(pool.filter(o => o.word !== p.word), rnd).slice(0, 3);
    return {
      word: p.word,
      reading: p.reading,
      answer: p.sense,
      options: shuffle([p.sense, ...distractors.map(d => d.sense)], rnd),
      level,
    };
  });
  return { level, questions };
}

/** A finished block's outcome. */
export interface BlockResult {
  level: number;
  correct: number;
  total: number;
  passed: boolean;
}

export function scoreBlock(level: number, answers: (string | null)[], questions: TestQuestion[]): BlockResult {
  const correct = questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  return { level, correct, total: questions.length, passed: correct >= passingScore(questions.length) };
}

/**
 * Where a placement run lands. `0` means they did not clear the easiest level, which is not
 * a failure state — it is the correct answer for a genuine beginner, and the caller should
 * read it as "start at the beginning".
 */
export function placementResult(blocks: BlockResult[]): number {
  let through = 0;
  for (const b of blocks) {
    if (!b.passed) break;
    through = b.level;
  }
  return through;
}

/** Human-readable summary for the result screen. */
export function placementSummary(lang: LanguageCode, through: number, labelFor: (l: number) => string): string {
  return through === 0
    ? 'Starting from the beginning — that is exactly what the first level is for.'
    : `Placed at ${labelFor(through)}. Everything up to and including it is unlocked.`;
}
