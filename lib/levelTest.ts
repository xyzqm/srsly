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

/**
 * Romance→English suffix pairs that make a cognate look less like one than it is.
 * Applied to both sides before comparing, longest first so `ción` beats `ón`.
 */
const COGNATE_SUFFIXES: [RegExp, string][] = [
  [/cion$/, 'tion'], [/sion$/, 'sion'], [/ncia$/, 'nce'], [/encia$/, 'ence'],
  [/mente$/, 'ly'], [/dad$/, 'ty'], [/tad$/, 'ty'], [/te$/, 'ty'],
  [/ismo$/, 'ism'], [/ista$/, 'ist'], [/ario$/, 'ary'], [/orio$/, 'ory'],
  [/ico$/, 'ic'], [/ica$/, 'ic'], [/ique$/, 'ic'], [/oso$/, 'ous'], [/eux$/, 'ous'],
  [/ivo$/, 'ive'], [/iva$/, 'ive'], [/if$/, 'ive'], [/eur$/, 'or'], [/aire$/, 'ary'],
  [/[oaeé]$/, ''],   // the commonest difference of all: a bare trailing vowel
];

/** Accent-stripped, lowercased, letters only. */
function plain(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

function foldCognate(s: string): string {
  const base = plain(s);
  for (const [re, to] of COGNATE_SUFFIXES) {
    if (re.test(base)) return base.replace(re, to);
  }
  return base;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** How close a word is to its own gloss once suffixes are folded, 0–1. */
function cognateSimilarity(word: string, term: string): number {
  const a = foldCognate(word), b = foldCognate(term);
  if (a.length < 4 || b.length < 4) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** Above this, the spelling gives the answer away. */
const COGNATE_THRESHOLD = 0.72;

/**
 * Whether the word's own gloss can be read straight off its spelling.
 *
 * `territorio = territory`, `federal = federal`, `innovación = innovation` — nearly a third
 * of Spanish B1 measured this way. A test made of those measures whether the learner can
 * recognise Latin roots, which an English speaker can do without studying a word of Spanish,
 * so it tells you nothing about their level. Chinese and Japanese are unaffected: nothing in
 * a non-Latin script survives `plain()` to be compared.
 */
export function isCognate(word: string, gloss: string): boolean {
  return primarySense(gloss)
    .split(/[,/]| or /)
    .map(t => t.replace(/^(to|a|an|the)\s+/i, '').trim())
    .some(t => t && cognateSimilarity(word, t) >= COGNATE_THRESHOLD);
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
  const bySense = new Map<string, { word: string; sense: string; reading: string; cognate: boolean }>();
  for (const word of levelWords) {
    const entry = vocab[word];
    if (!entry?.meaning) continue;
    const sense = primarySense(entry.meaning);
    if (!sense || bySense.has(sense.toLowerCase())) continue;
    bySense.set(sense.toLowerCase(), {
      word, sense,
      reading: entry.reading ?? entry.pinyin ?? '',
      cognate: isCognate(word, entry.meaning),
    });
  }
  // Cognates are dropped — but only while enough real words remain. A level too small to
  // fill a question without them is better tested with them than not tested at all.
  const all = [...bySense.values()];
  const earned = all.filter(c => !c.cognate);
  const pool = earned.length >= Math.max(4, count + 3) ? earned : all;
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
