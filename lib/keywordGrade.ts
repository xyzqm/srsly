import { latinClose } from './typedAnswer';

/**
 * THE FREE GRADER, AND WHY IT HAD TO GET BETTER RATHER THAN JUST GETTING USED LESS.
 *
 * `grade-response` DEGRADES where the other two spending routes refuse: a learner always gets a
 * grade, from the model when a key is paying and from here when one is not — or when the
 * provider fails, which on a free tier happens often. That design is right and it has a bill
 * attached: whatever this returns is presented to a learner as their result, so it has to be
 * defensible on its own rather than a placeholder that is usually replaced.
 *
 * It was not. Reported from a live session, all three in one sitting:
 *
 *   "Le gusta mucho nadar en el mar."   → MISS, "the answer involves le"   (correct answer!)
 *   "le gusta mucho nadar en el mar."   → OK                               (same words, lowercase)
 *   "le gusta mucho pelear en el mar."  → OK                               (the passage says nadar)
 *
 * Three separate faults, and the third is the one that matters:
 *
 * 1. **CASE.** `response.includes(k)` against a key word of "le" fails on "Le" at the start of
 *    a sentence — which is where a Spanish learner correctly capitalises it. The grader was
 *    strictest exactly where the writing was best.
 *
 * 2. **SUBSTRING, NOT WORD.** `includes` also matched inside other words, so "le" was satisfied
 *    by "possible" or "leer" in a space-delimited language. Chinese and Japanese are the
 *    opposite case and genuinely need substring matching, which is why the original code looked
 *    reasonable — the rule is per-script, not universal.
 *
 * 3. **IT NEVER LOOKED AT THE ANSWER.** It scored the `key` array and nothing else, and the
 *    generator had picked `["le"]` — a clitic pronoun — as the key vocabulary for that
 *    question. So the grader was asking "did they write the word 'le'" when the question was
 *    "what does Pedro like to do", and `pelear` (to fight) scored full marks against a passage
 *    that says `nadar` (to swim). No amount of fixing case or word boundaries touches that.
 *
 * ── WHAT IT COMPARES AGAINST NOW, AND WHERE THAT CAME FROM ───────────────────
 *
 * `Question.model` is an ENGLISH model answer, by the generator's own schema, so it cannot be
 * compared to a Spanish sentence at all. But every question also carries multiple-choice
 * OPTIONS, one flagged `correct`, written in the TARGET LANGUAGE — the right answer, already
 * generated, already stored, and never once sent to the grader. That is `expected` here.
 *
 * ── THE INFORMATIVE PART OF AN ANSWER IS WHAT IT ADDS TO THE QUESTION ────────
 *
 * Which words in the expected answer actually carry it? Not the frequent ones — there is no
 * stop-word list here and building four of them would be a large, per-language, badly-evidenced
 * thing to maintain. But the question is already in hand, and an answer repeats most of it:
 *
 *   Q:        ¿Qué le gusta hacer a Pedro en el mar durante el verano?
 *   expected: Le gusta nadar en el mar.
 *   core:     nadar
 *
 * Subtracting the question's own words leaves precisely the content being tested, in any
 * language, with no list to curate. `pelear` then fails because `nadar` is missing, which is
 * the fault the learner actually reported.
 *
 * ── AND "RIGHT IDEA, NOT A SENTENCE" IS ITS OWN VERDICT ──────────────────────
 *
 * "nadar en el mar." has the content and is not an answer to the question as asked. Marking it
 * wrong is false and marking it right teaches that a bare noun phrase will do, so it is
 * `partial` with the thing to fix named — which is what `key` is genuinely good for, being the
 * words the question was built to test.
 */

export interface KeywordGrade {
  verdict: 'ok' | 'partial' | 'miss';
  message: string;
  /** Key words the learner actually used. Drives the "Used:" chips under the feedback. */
  wordsHit: string[];
}

export interface KeywordGradeInput {
  /** What the learner wrote. */
  response: string;
  /** Key vocabulary the question was built around. */
  key: string[];
  /** The question, in the target language — used to subtract its own words from `expected`. */
  question?: string;
  /** The correct answer IN THE TARGET LANGUAGE, i.e. the `correct` multiple-choice option. */
  expected?: string;
  /** For the message, e.g. "Spanish". */
  langName: string;
  /** Chinese and Japanese, where there are no spaces to split on. */
  unspaced: boolean;
}

/** Everything a learner could write that is not a word. Unicode-aware, so accents survive. */
const SPLIT = /[^\p{L}\p{N}'’-]+/u;

function words(s: string): Set<string> {
  return new Set(latinClose(s).split(SPLIT).filter(Boolean));
}

/**
 * Is this word in that text?
 *
 * SUBSTRING FOR UNSPACED SCRIPTS, WHOLE WORDS OTHERWISE. Chinese and Japanese have no spaces to
 * split on, so a substring test is the only one available and is correct there. Applying it to
 * Spanish is what let "le" be satisfied by "posible".
 */
function used(text: string, needle: string, unspaced: boolean): boolean {
  const n = latinClose(needle);
  if (!n) return false;
  return unspaced ? latinClose(text).includes(n) : words(text).has(n);
}

/** The words `expected` adds to `question` — the content actually being asked for. */
export function answerCore(question: string, expected: string, unspaced: boolean): string[] {
  if (!expected.trim()) return [];
  /**
   * NO CORE FOR AN UNSPACED SCRIPT, deliberately. Set subtraction needs words, and splitting
   * Chinese on punctuation gives whole clauses rather than words — every segmenter in this
   * codebase is server-side and this function runs on both sides of the wire. A wrong core is
   * worse than none: it would mark a correct Chinese answer as missing content that was never
   * a word in the first place. zh/ja fall through to the key-vocabulary path below, which is
   * what they had before and is unharmed.
   */
  if (unspaced) return [];
  const q = words(question);
  return [...words(expected)].filter(w => !q.has(w) && w.length > 1);
}

export function keywordGrade(input: KeywordGradeInput): KeywordGrade {
  const { response, key, question = '', expected = '', langName, unspaced } = input;

  const wordsHit = key.filter(k => used(response, k, unspaced));
  const missingKey = key.filter(k => !used(response, k, unspaced));

  if (response.trim().length < 4) {
    return { verdict: 'miss', message: `Too short — write a full sentence in ${langName}.`, wordsHit: [] };
  }

  const core = answerCore(question, expected, unspaced);
  if (core.length > 0) {
    const coreHit = core.filter(w => used(response, w, unspaced));
    const coreMissing = core.filter(w => !used(response, w, unspaced));

    if (coreHit.length === 0) {
      return {
        verdict: 'miss',
        message: `That is not what the passage says — reread it. The answer involves ${core.slice(0, 2).join(', ')}.`,
        wordsHit,
      };
    }
    if (coreMissing.length > 0) {
      return {
        verdict: 'partial',
        message: `Part of it. The answer also involves ${coreMissing.slice(0, 2).join(', ')}.`,
        wordsHit,
      };
    }
    /**
     * Content right, but not written as an answer. `key` is the right thing to ask for here:
     * those are the words the question was built to test, so naming them is a real instruction
     * rather than "be more complete".
     */
    if (missingKey.length > 0) {
      return {
        verdict: 'partial',
        message: `That is the right idea. Now write it as a full sentence — the passage uses ${missingKey.slice(0, 2).join(', ')}.`,
        wordsHit,
      };
    }
    return { verdict: 'ok', message: `Correct — that is what the passage says.`, wordsHit };
  }

  /**
   * NO EXPECTED ANSWER TO WORK FROM — an older cached question, or an unspaced script. Back to
   * scoring the key vocabulary, which is weak for the reasons above but is all there is, and is
   * at least no longer case-sensitive or matching inside other words.
   */
  const ratio = wordsHit.length / Math.max(key.length, 1);
  if (ratio >= 0.66) {
    return { verdict: 'ok', message: `Good — you included the key ideas (${wordsHit.join('、')}).`, wordsHit };
  }
  if (ratio >= 0.34) {
    return {
      verdict: 'partial',
      message: `You used some key words. Try also including: ${missingKey.slice(0, 2).join('、')}.`,
      wordsHit,
    };
  }
  return {
    verdict: 'miss',
    message: `Reread the passage — the answer involves ${key.slice(0, 2).join('、')}.`,
    wordsHit: [],
  };
}
