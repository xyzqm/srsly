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
  /**
   * Where this question came from. `'focus'` means the lesson named the forms and this blank
   * is the rule itself; `'length'` means the sentence was too short to order and a word was
   * removed at random.
   *
   * It exists for the TEST rather than for the UI, and that is a fair reason: a lesson can
   * produce both kinds, so without it `tests/lessonFocus.test.ts` cannot assert anything about
   * the focus questions without also asserting it of the random ones.
   */
  via: 'focus' | 'length';
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

/**
 * Write the word: one accented character is blanked and the learner picks it.
 *
 * ⚠ THIS IS THE FRENCH ANALOGUE OF THE SPANISH STRESS QUESTION, AND IT HAD TO BE A DIFFERENT
 * SHAPE. The Spanish drill can ask "which syllable is stressed" because Spanish stress is
 * lexical and the tilde writes it down. French stress is not lexical at all, so there is
 * nothing to point at — the decision a French learner actually makes while writing is WHICH
 * MARK the letter takes, and `é` against `è` is the one they get wrong.
 *
 * The options are the real alternatives for that letter, so this is a choice between spellings
 * a learner could plausibly produce rather than between a right answer and three absurdities.
 */
export interface AccentLetterQuestion {
  kind: 'accent-letter';
  word: AccentWord;
  /** The word with the accented character replaced, for display. */
  masked: string;
  options: string[];
  answer: string;
}

export type PracticeQuestion =
  | OrderQuestion | ChoiceQuestion
  | AccentStressQuestion | AccentRuleQuestion | AccentLetterQuestion;

/** Short enough for a button, specific enough to be a real choice. */
export const ACCENT_RULE_LABEL: Record<AccentRule, string> = {
  // Spanish — every one of these names a stressed syllable.
  aguda:      'aguda — stressed on the last syllable',
  llana:      'llana — stressed on the second-to-last',
  esdrujula:  'esdrújula — stressed on the third-to-last',
  hiato:      'hiato — a stressed i or u splitting the pair',
  diacritica: 'tilde diacrítica — it tells two words apart',
  // French — every one of these names something about a LETTER. See `FrAccentRule`.
  'aigu':             'accent aigu — the closed e of café',
  'grave-son':        'accent grave — the open e of père',
  'grave-homographe': 'accent grave — no sound change; it separates two words',
  'circonflexe':      'accent circonflexe — a letter, usually s, that used to be there',
  'cedille':          'cédille — keeps c soft before a, o and u',
  'trema':            'tréma — the vowel is sounded separately from the one before it',
};

/**
 * Which question each rule earns.
 *
 * ⚠ THE OPTIONS ARE SCOPED TO THE LESSON, NOT TO THIS TABLE. A Spanish question must never
 * offer `cédille` and a French one must never offer `esdrújula`, so `buildQuestions` draws the
 * option list from the rules the LESSON'S OWN WORDS use. That also makes every option
 * reachable by construction rather than by a list somebody has to keep in step.
 *
 * The split between asking for the letter and asking for the rule is a judgement about where
 * the learning is, and it is a table rather than a per-word field so it cannot drift word by
 * word. `aigu` and `grave-son` are choices you make with a pen — which is why they are the two
 * French learners get wrong — so they are asked as letters. The other four are facts about why
 * a mark exists at all, which no amount of staring at the word reveals, so they are asked as
 * rules. Spanish is all rules, because its own second shape is the stress question below.
 */
const QUESTION_FOR_RULE: Record<AccentRule, 'rule' | 'letter'> = {
  aguda: 'rule', llana: 'rule', esdrujula: 'rule', hiato: 'rule', diacritica: 'rule',
  'aigu': 'letter', 'grave-son': 'letter',
  'grave-homographe': 'rule', 'circonflexe': 'rule', 'cedille': 'rule', 'trema': 'rule',
};

/**
 * The spellings a learner could plausibly write instead.
 *
 * Keyed by the CORRECT character and always including the bare letter, because "no accent at
 * all" is the commonest wrong answer and leaving it out would make the question easier than
 * writing the word is.
 */
const LETTER_CHOICES: Record<string, string[]> = {
  'é': ['e', 'é', 'è', 'ê'],
  'è': ['e', 'é', 'è', 'ê'],
  'ê': ['e', 'é', 'è', 'ê'],
  'ë': ['e', 'é', 'è', 'ë'],
  'à': ['a', 'à', 'â'],
  'â': ['a', 'à', 'â'],
  'î': ['i', 'î', 'ï'],
  'ï': ['i', 'î', 'ï'],
  'ô': ['o', 'ó', 'ô'],
  'ù': ['u', 'ù', 'û'],
  'û': ['u', 'ù', 'û'],
  'ç': ['c', 'ç'],
};

/** Where the one accented character sits, or -1. Exported for the test that pins "exactly one". */
export function accentedCharIndex(word: string): number {
  return [...word].findIndex(c => c in LETTER_CHOICES);
}

/**
 * Does this word carry a diacritic one of the rule sets explains?
 *
 * ⚠ THIS WAS ACUTE-VOWELS-ONLY AND THAT WAS RIGHT FOR A SPANISH-ONLY DRILL AND WRONG AS A
 * GENERAL TEST. The reasoning then was that `ü` is a diaeresis rather than a stress mark, so
 * counting it would send `vergüenza` down the rule branch with no tilde to explain — true of
 * SPANISH, where every rule names a stressed syllable. French has a tréma rule, a cédille rule
 * and three graves that are not acute, so the narrow version read every French word in the
 * drill as unaccented and would have asked where the stress falls in a language that has no
 * lexical stress to find.
 *
 * `ñ` stays out, and that half of the original reasoning survives intact: it is a LETTER of
 * the Spanish alphabet rather than a mark on one, and no rule here explains it.
 */
export function hasWrittenAccent(word: string): boolean {
  return /[áéíóúàèùâêîôûëïüç]/iu.test(word);
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
 * Match a tile against a lesson's `focus` set, ignoring case and trailing punctuation.
 *
 * Case has to be ignored because `tests/lessons.test.ts` capitalises the first word of every
 * Spanish and French sentence, so the tile is `El` while the rule is about `el`.
 */
function focusIndex(tiles: string[], focus: readonly string[]): number {
  const want = new Set(focus.map(f => f.toLowerCase()));
  /*
    ⚠ THE FINAL TILE IS INCLUDED, AND EXCLUDING IT KILLED THREE LESSONS OUTRIGHT.
    The length-based choice question never blanks the last tile, because it carries the
    sentence's punctuation and a gap there is visible before a word is read. That reasoning
    does not survive contact with Chinese or Japanese: a SENTENCE-FINAL PARTICLE is final by
    definition, so `zh-ne-ba` (吗？/吧。/呢？) and `ja-aru-iru` (います。/あります。) had every
    one of their sentences skipped and silently stayed on the ordering drill — the exact
    failure the focus mechanism exists to remove.

    The punctuation is handled instead of avoided: the blank takes the WHOLE tile and every
    option wears the same trailing mark, so it is identical across the list and distinguishes
    nothing. See `focusOptions`.
  */
  for (let i = 0; i < tiles.length; i++) {
    if (want.has(bareWord(tiles[i]).toLowerCase())) return i;
  }
  return -1;
}

/**
 * The option list for a focus question, wearing the blanked tile's own capitalisation.
 *
 * ⚠ THIS IS THE WHOLE QUESTION, NOT A DETAIL. Blanking `El` and offering `El / la / los / las`
 * hands over the answer: one option is capitalised and the gap is at the start of a sentence.
 * Every option takes the case of the tile that was removed, so the only thing separating them
 * is the grammar.
 */
function focusOptions(focus: readonly string[], answer: string): string[] {
  const bare = bareWord(answer);
  // Whatever the blanked tile carried after its word — a full stop, a question mark, nothing.
  // Appended to EVERY option so the mark is constant across the list, which is what makes
  // blanking a sentence-final particle a fair question rather than a giveaway.
  const punct = answer.slice(bare.length);
  const capitalised = bare[0] === bare[0]?.toUpperCase() && bare[0] !== bare[0]?.toLowerCase();
  const cased = (w: string) => (capitalised ? w.charAt(0).toUpperCase() + w.slice(1) : w);
  // Deduplicated AFTER casing, so a set naming both `el` and `El` cannot show one twice.
  return [...new Set(focus.map(f => cased(f) + punct))];
}


/**
 * ⚠ WOULD BLANKING THIS FORM PUT THE ANSWER IN THE PROMPT?
 *
 * The prompt for a sentence question is its English gloss, and `promptFor` already strips the
 * teaching aside for exactly this reason — "This sheet of paper is big — 张 for flat things"
 * printed the answer above the answer box. The focus questions reopened the problem from the
 * other side: `es-negation` blanks **No** in "No tengo dinero.", whose gloss is "I have **no**
 * money." The Spanish answer is an ordinary English word, and the prompt hands it over.
 *
 * Caught by `tests/lessonPractice.test.ts`, which has asserted this of every prompt since long
 * before focus questions existed — so the rule is enforced here rather than worked around by
 * deleting `no` from the lesson that is ABOUT no.
 *
 * A leak falls back to the ordering question, which costs that one sentence and nothing else.
 *
 * The two matching rules are the two the test uses, and the difference is load-bearing: a bare
 * substring on a Latin answer is useless (`a`, from `fr-avoir`, is inside half the words in
 * any English sentence) and a word boundary on CJK is meaningless, since `\b` needs spaces.
 */
function promptLeaksAnswer(gloss: string, answer: string): boolean {
  const word = bareWord(answer);
  if (!word) return false;
  const [prompt] = gloss.split(' \u2014 ');
  if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(word)) return prompt.includes(word);
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(prompt);
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
  if (lesson.accentWords?.length) {
    // Only the rules this lesson's own words use, so a Spanish question cannot offer `cédille`
    // and a French one cannot offer `esdrújula`. Declaration order, not shuffled: a stable
    // option list is one the learner can scan rather than re-read on every question.
    const ruleOptions = [...new Set(
      lesson.accentWords.filter(w => hasWrittenAccent(w.word)).map(w => w.rule),
    )];
    return shuffle(lesson.accentWords.map(w => accentQuestion(w, ruleOptions)), rand);
  }

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

    /*
      ── A LESSON ABOUT A CHOICE ASKS ABOUT THAT CHOICE, AHEAD OF EVERYTHING ELSE ──
      Checked BEFORE the length test, because length is a fact about the sentence and this is
      a fact about the rule — and the length test is what silently turned 90% of lessons into
      a word-order drill. `El perro es grande.` is four tiles and would have been ordered; it
      is a gender lesson, so it is `___ perro es grande.` against El / La instead.

      Falls through to ordering when the sentence contains none of the lesson's forms, so a
      focus set is additive and a lesson without one is untouched.
    */
    const fi = lesson.focus?.length ? focusIndex(tiles, lesson.focus) : -1;
    if (fi >= 0 && !promptLeaksAnswer(example.gloss, tiles[fi])) {
      // The whole tile, punctuation and all — `focusOptions` puts the same mark on every
      // option, so the answer is still only distinguishable by its grammar.
      const answer = tiles[fi];
      const options = focusOptions(lesson.focus!, answer);
      // Two options or it is not a choice — a one-option set would render a gap with a single
      // button under it, which gives the answer away more thoroughly than printing it.
      if (options.length >= 2) {
        questions.push({
          kind: 'choice', example, tiles, blankIndex: fi, via: 'focus',
          options: shuffle(options, rand), answer,
        });
        continue;
      }
    }

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
      via: 'length',
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
function accentQuestion(word: AccentWord, ruleOptions: AccentRule[]): PracticeQuestion {
  // No mark at all: the only thing such a word can be asked is where its stress falls, and
  // only Spanish has words in the drill without one. A test requires the syllables.
  if (!hasWrittenAccent(word.word)) {
    const syllables = word.syllables ?? [word.word];
    return {
      kind: 'accent-stress',
      word,
      options: syllables,
      answer: syllables[word.stress ?? 0],
    };
  }
  if (QUESTION_FOR_RULE[word.rule] === 'letter') {
    const i = accentedCharIndex(word.word);
    const chars = [...word.word];
    const answer = chars[i];
    return {
      kind: 'accent-letter',
      word,
      masked: chars.map((c, j) => (j === i ? '\u2002' : c)).join(''),
      options: LETTER_CHOICES[answer],
      answer,
    };
  }
  return { kind: 'accent-rule', word, options: ruleOptions, answer: word.rule };
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
  if (q.kind === 'accent-letter') return 'Which accent does this letter take?';
  // "mark" rather than "tilde": the same question is asked of a cédille and a circonflexe,
  // and calling either a tilde would be wrong in the prompt that introduces them.
  if (q.kind === 'accent-rule') return `Why does ${q.word.word} carry its mark?`;
  const [meaning] = q.example.gloss.split(' — ');
  return meaning.trim();
}
