import type { Lesson, LessonExample } from './lessons';

/**
 * Turning a lesson's examples into a run of practice questions.
 *
 * ── WHY A SESSION AND NOT A LIST ──
 * Practice used to be every exercise stacked down the page, all visible at once, each
 * independently checkable. That is a worksheet: there is no sense of progress, nothing tells
 * you when you are finished, and a wrong answer costs so little that there is no reason to
 * think before tapping. A run — one question at a time, a bar that fills, and the ones you
 * missed coming back at the end — is the same content asking for actual attention.
 *
 * ── STILL GRADED BY NOBODY ──
 * Getting one wrong re-queues it inside this session and nothing else. No FSRS write, no
 * streak, no record that survives closing the lesson. The curriculum is deliberately separate
 * from scheduling (see lib/lessons.ts), and a lesson you can fail is a lesson you avoid.
 *
 * ── TWO SHAPES, BECAUSE ONE WAS TOO EASY ──
 * A two-tile ordering question is not a question: the tile carrying the full stop has to go
 * last, so `我 / 吃饭。` solves itself. Rather than drop the short examples, they get a second
 * shape — one word removed and picked from four — which stays hard at any sentence length and
 * asks about the word rather than the ordering. Which shape an example gets is decided here,
 * from the example itself, so no lesson data has to change.
 */

/** A word removed from a sentence, to be chosen from several options. */
export interface ChoiceQuestion {
  kind: 'choice';
  example: LessonExample;
  /** Tiles with the answer's slot left empty — render a gap where `blankIndex` sits. */
  tiles: string[];
  blankIndex: number;
  /** The correct tile, plus distractors, already shuffled. */
  options: string[];
  answer: string;
}

/** The whole sentence, out of order, to be rebuilt. */
export interface OrderQuestion {
  kind: 'order';
  example: LessonExample;
  tiles: string[];
}

export type PracticeQuestion = OrderQuestion | ChoiceQuestion;

/**
 * Below this, ordering is trivial: with punctuation pinned to the last tile, two tiles have
 * only one sensible arrangement and the learner is not being asked anything.
 */
export const MIN_ORDER_TILES = 3;

/** Options shown for a choice question, including the right one. */
export const CHOICE_OPTIONS = 4;

/** Deterministic shuffle when a seed is supplied — tests need a fixed order. */
function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A tile stripped of trailing punctuation, for comparing two tiles as the same WORD.
 *
 * The last tile carries the full stop (`吃饭。`), so a distractor drawn from another
 * sentence's final tile would otherwise be trivially identifiable as the one with a `。` on
 * it — the exact giveaway this module exists to remove.
 */
export function bareWord(tile: string): string {
  return tile.replace(/[。．.!！?？,，、;；:：]+$/u, '');
}

/**
 * Build one lesson's questions.
 *
 * `rand` is injectable so tests can pin the shuffle; the UI passes `Math.random`.
 */
export function buildQuestions(lesson: Lesson, rand: () => number = Math.random): PracticeQuestion[] {
  const examples = (lesson.examples ?? []).filter(e => (e.tiles?.length ?? 0) > 1);
  if (!examples.length) return [];

  // Every distinct word in the lesson, as a pool of plausible distractors. Drawn from the
  // same lesson so a wrong option is always something the learner has just been taught —
  // a distractor from nowhere is not a distractor, it is noise.
  const vocabulary = [...new Set(
    examples.flatMap(e => (e.tiles ?? []).map(bareWord)).filter(Boolean),
  )];

  const questions: PracticeQuestion[] = [];
  for (const example of examples) {
    const tiles = example.tiles!;
    if (tiles.length >= MIN_ORDER_TILES) {
      questions.push({ kind: 'order', example, tiles });
      continue;
    }

    // Too short to order. Blank one word instead — never the final tile, whose punctuation
    // would make the gap obvious and whose options would all need the same punctuation.
    const blankIndex = tiles.length > 1 ? Math.floor(rand() * (tiles.length - 1)) : 0;
    const answer = bareWord(tiles[blankIndex]);
    const distractors = shuffle(vocabulary.filter(w => w && w !== answer), rand)
      .slice(0, CHOICE_OPTIONS - 1);
    // A lesson with almost no vocabulary of its own cannot fill four options; fewer is
    // honest, and better than padding with a word from another lesson entirely.
    questions.push({
      kind: 'choice',
      example,
      tiles,
      blankIndex,
      options: shuffle([answer, ...distractors], rand),
      answer,
    });
  }

  return shuffle(questions, rand);
}

/** Did this answer match? Order questions compare position; choice compares the word. */
export function isCorrect(q: PracticeQuestion, given: string[]): boolean {
  if (q.kind === 'order') {
    return given.length === q.tiles.length && given.every((t, i) => t === q.tiles[i]);
  }
  return given.length === 1 && given[0] === q.answer;
}

/**
 * The prompt, with the teaching aside removed.
 *
 * 139 of the 333 glosses carry an explanation after an em dash — "Three people — 个 is the
 * general measure word." That is exactly right in the examples list and fatal in a question,
 * because it names the word being tested: the prompt for the 张 sentence read "This sheet of
 * paper is big — 张 for flat things", which is the answer printed above the answer box.
 *
 * The aside is not discarded, only deferred: the explanation panel shown after answering
 * prints `example.gloss` in full, which is where the teaching belongs.
 */
export function promptFor(q: PracticeQuestion): string {
  const [meaning] = q.example.gloss.split(' — ');
  return meaning.trim();
}
