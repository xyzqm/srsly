import type { AccentRule, AccentWord, Lesson, LessonExample } from './lessons';

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
 * ── THE SENTENCES ARE NOT THE EXAMPLES ──
 * A lesson's `practice` array holds sentences written for the exercise; `examples` holds the
 * ones printed above it, with their teaching glosses. Building questions from the examples
 * meant the answer was on the page the learner had just read — the exercise tested scrollback
 * rather than the rule. Practice sentences are preferred whenever a lesson has them, and the
 * examples remain the fallback so a lesson without them still has an exercise.
 *
 * The DISTRACTOR pool is drawn from both, because a plausible wrong option is one the learner
 * has just been taught, and everything in either list qualifies.
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
  /** The tiles in the CORRECT order — this is the answer. */
  tiles: string[];
  /**
   * The same tiles in the order the pool SHOWS them, which is not the answer's order.
   *
   * It has to be carried on the question rather than shuffled at render, and the reason is
   * that the pool is now a fixed row of slots: a tile keeps its place when it is used, so its
   * position is an identity the component relies on and a fresh shuffle every render would
   * move the tiles under the learner's finger mid-question.
   */
  shuffled: string[];
}

/**
 * Tap the stressed syllable of a word that carries NO written accent.
 *
 * Asked only of unaccented words, and that is the whole point: on `jamón` the tilde already
 * points at the answer, so the question would be free. On `examen` the learner has to apply
 * the default rule — llana unless the word says otherwise — which is the rule the lesson is
 * actually teaching and the one that decides every word they will ever write.
 *
 * The syllables are shown IN ORDER, never shuffled: shuffled syllables are not a word.
 */
export interface AccentStressQuestion {
  kind: 'accent-stress';
  word: AccentWord;
  /** The syllables, in order. Tapping one is the answer. */
  options: string[];
  answer: string;
}

/**
 * Name the rule that writes a word's tilde.
 *
 * The mirror of the above, asked of words that DO carry one — where the stress is readable
 * off the page and the thing still worth knowing is why the mark is there at all. Between the
 * two, every word in the drill asks something the learner cannot simply read.
 */
export interface AccentRuleQuestion {
  kind: 'accent-rule';
  word: AccentWord;
  options: AccentRule[];
  answer: AccentRule;
}

export type PracticeQuestion = OrderQuestion | ChoiceQuestion | AccentStressQuestion | AccentRuleQuestion;

/** Short enough for a button, specific enough to be a real choice. */
export const ACCENT_RULE_LABEL: Record<AccentRule, string> = {
  aguda:      'aguda — stressed on the last syllable',
  llana:      'llana — stressed on the second-to-last',
  esdrujula:  'esdrújula — stressed on the third-to-last',
  hiato:      'hiato — a stressed i or u splitting the pair',
  diacritica: 'tilde diacrítica — it tells two words apart',
};

const ACCENT_RULES = Object.keys(ACCENT_RULE_LABEL) as AccentRule[];

/**
 * Does this word carry a written accent?
 *
 * Acute vowels ONLY. `ñ` is a letter rather than a mark, and `ü` is a diaeresis that says the
 * u is pronounced in `güe`/`güi` — neither marks stress, and counting either would send a word
 * like `español` or `vergüenza` down the wrong branch.
 */
export function hasWrittenAccent(word: string): boolean {
  return /[áéíóúÁÉÍÓÚ]/u.test(word);
}


/**
 * Below this, ordering is trivial: with punctuation pinned to the last tile, two tiles have
 * only one sensible arrangement and the learner is not being asked anything.
 */
export const MIN_ORDER_TILES = 3;

/** Options shown for a choice question, including the right one. */
export const CHOICE_OPTIONS = 4;

/**
 * How many times to re-draw a pool order that came out as the answer.
 *
 * A shuffle is allowed to land on the identity permutation, and for a four-tile sentence that
 * is one time in 24 — so the exercise occasionally opened with the sentence already built and
 * asked nothing at all. Re-drawing is the fix; the cap is there because a sentence whose
 * tiles are all the SAME word has no other arrangement and would otherwise loop forever.
 */
const RESHUFFLE_TRIES = 12;

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
  // An orthography lesson gets the accent drill INSTEAD of the sentence one. Which shape a
  // lesson gets is decided from its own data, the same way `MIN_ORDER_TILES` decides between
  // ordering and choosing — see `AccentWord` for why ordering tiles cannot ask about spelling.
  if (lesson.accentWords?.length) return shuffle(lesson.accentWords.map(accentQuestion), rand);

  const buildable = (list?: LessonExample[]) => (list ?? []).filter(e => (e.tiles?.length ?? 0) > 1);
  // Purpose-written sentences when the lesson has them; the printed examples otherwise, so a
  // lesson that has not been given practice sentences yet is degraded and not empty.
  const examples = buildable(lesson.practice).length ? buildable(lesson.practice) : buildable(lesson.examples);
  if (!examples.length) return [];

  // Every distinct word in the lesson, as a pool of plausible distractors. Drawn from the
  // same lesson so a wrong option is always something the learner has just been taught —
  // a distractor from nowhere is not a distractor, it is noise. Both lists feed it: an
  // example's words are as freshly taught as a practice sentence's.
  const vocabulary = [...new Set(
    [...buildable(lesson.practice), ...buildable(lesson.examples)]
      .flatMap(e => (e.tiles ?? []).map(bareWord)).filter(Boolean),
  )];

  const questions: PracticeQuestion[] = [];
  for (const example of examples) {
    const tiles = example.tiles!;
    if (tiles.length >= MIN_ORDER_TILES) {
      let shuffled = shuffle(tiles, rand);
      for (let i = 0; i < RESHUFFLE_TRIES && sameOrder(shuffled, tiles); i++) {
        shuffled = shuffle(tiles, rand);
      }
      questions.push({ kind: 'order', example, tiles, shuffled });
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

/**
 * Which question a word earns, decided by the word itself.
 *
 * A written tilde gives the stress away, so an accented word is asked for the RULE; an
 * unaccented one is asked where the stress falls, which it cannot show. Neither branch is
 * answerable by reading the prompt, which is the whole reason the split exists rather than
 * one question type for all of them.
 */
function accentQuestion(word: AccentWord): PracticeQuestion {
  if (hasWrittenAccent(word.word)) {
    return { kind: 'accent-rule', word, options: ACCENT_RULES, answer: word.rule };
  }
  return {
    kind: 'accent-stress',
    word,
    options: word.syllables,
    answer: word.syllables[word.stress],
  };
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/** Did this answer match? Order questions compare position; choice compares the word. */
export function isCorrect(q: PracticeQuestion, given: string[]): boolean {
  if (q.kind === 'order') {
    return sameOrder(given, q.tiles);
  }
  // Choice and both accent shapes are all one pick. The stress answer compares the SYLLABLE
  // rather than its index, which is safe because `tests/lessons.test.ts` asserts a word's
  // syllables are distinct — two identical tiles would make tapping either one ambiguous.
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
  // An accent question has no sentence and no gloss — it asks about one word, and the word is
  // shown beside the prompt rather than inside it.
  if (q.kind === 'accent-stress') return 'Which syllable is stressed?';
  if (q.kind === 'accent-rule') return `Why does ${q.word.word} carry a tilde?`;
  const [meaning] = q.example.gloss.split(' — ');
  return meaning.trim();
}
