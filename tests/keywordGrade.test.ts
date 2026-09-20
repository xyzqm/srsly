import { describe, it, expect } from 'vitest';
import { keywordGrade, answerCore } from '@/lib/keywordGrade';

/**
 * THE THREE GRADES A LEARNER ACTUALLY GOT, IN ONE SITTING, ON ONE QUESTION.
 *
 * Question: ¿Qué le gusta hacer a Pedro en el mar durante el verano?
 * Passage:  …A mi hermano Pedro le gusta mucho nadar en el mar.
 * Key:      ["le"]   ← what the generator picked as the vocabulary under test
 *
 *   "Le gusta mucho nadar en el mar."   → MISS   "the answer involves le"
 *   "le gusta mucho nadar en el mar."   → OK
 *   "le gusta mucho pelear en el mar."  → OK
 *
 * The same sentence graded two ways on a capital letter, and a wrong verb graded correct. All
 * three are pinned below, because this grader's output is shown to a learner as their result
 * whenever the provider is unavailable — which on a free tier is often.
 */

const ES = { langName: 'Spanish', unspaced: false };
const QUESTION = '¿Qué le gusta hacer a Pedro en el mar durante el verano?';
const EXPECTED = 'Le gusta nadar en el mar.';

const grade = (response: string, key = ['le']) =>
  keywordGrade({ response, key, question: QUESTION, expected: EXPECTED, ...ES });

describe('the three grades that were reported', () => {
  it('accepts the correct answer written with a capital letter', () => {
    expect(grade('Le gusta mucho nadar en el mar.').verdict).toBe('ok');
  });

  it('accepts the same answer in lower case — they must not differ', () => {
    const upper = grade('Le gusta mucho nadar en el mar.');
    const lower = grade('le gusta mucho nadar en el mar.');
    expect(lower.verdict).toBe(upper.verdict);
  });

  /** THE ONE THAT MATTERS: the passage says nadar, and pelear is a different verb. */
  it('does not accept a wrong verb just because a key word appears', () => {
    const g = grade('le gusta mucho pelear en el mar.');
    expect(g.verdict).not.toBe('ok');
    expect(g.message).toContain('nadar');
  });
});

describe('right idea, not yet an answer', () => {
  /**
   * "nadar en el mar." has the content and is not an answer to the question as asked. Marking
   * it wrong is false; marking it right teaches that a bare phrase will do.
   */
  it('is partial, and names what to add', () => {
    const g = grade('nadar en el mar.');
    expect(g.verdict).toBe('partial');
    expect(g.message).toMatch(/full sentence/i);
    expect(g.message).toContain('le');
  });

  it('is not partial once the sentence is complete', () => {
    expect(grade('le gusta nadar en el mar.').verdict).toBe('ok');
  });
});

describe('a word is a word, not a run of letters', () => {
  /**
   * `includes` matched inside other words, so "le" was satisfied by anything containing those
   * two letters. Chinese and Japanese genuinely need substring matching — there are no spaces
   * to split on — which is why the original looked reasonable. The rule is per-script.
   */
  it('does not count a key word found inside another word', () => {
    const g = keywordGrade({
      response: 'Es posible leer.', key: ['le'], question: QUESTION, expected: EXPECTED, ...ES,
    });
    expect(g.wordsHit).toEqual([]);
  });

  it('still matches inside a string for an unspaced script', () => {
    const g = keywordGrade({
      response: '他喜欢在海里游泳。', key: ['游泳'], langName: 'Chinese', unspaced: true,
    });
    expect(g.wordsHit).toEqual(['游泳']);
    expect(g.verdict).toBe('ok');
  });

  /** Accents fold the way typed recall folds them, because it is the same exported rule. */
  it('forgives a missing accent', () => {
    expect(grade('le gusta mucho nadar en el mar. Que bien.').verdict).toBe('ok');
  });
});

describe('the core of an answer is what it adds to the question', () => {
  it('subtracts the question, leaving the content under test', () => {
    expect(answerCore(QUESTION, EXPECTED, false)).toEqual(['nadar']);
  });

  /**
   * NO CORE FOR AN UNSPACED SCRIPT, and that is deliberate rather than an omission. Set
   * subtraction needs words, every segmenter here is server-side, and a wrong core would mark a
   * correct Chinese answer as missing something that was never a word. zh/ja fall through to
   * the key-vocabulary path, which is what they had before.
   */
  it('declines to guess at word boundaries it cannot see', () => {
    expect(answerCore('他喜欢做什么？', '他喜欢游泳。', true)).toEqual([]);
  });

  it('is empty when there is no expected answer to work from', () => {
    expect(answerCore(QUESTION, '', false)).toEqual([]);
  });
});

describe('without an expected answer it degrades rather than breaking', () => {
  /** Older cached questions carry no options, so there is nothing to subtract. */
  const noExpected = (response: string, key: string[]) =>
    keywordGrade({ response, key, question: QUESTION, ...ES });

  it('falls back to scoring the key vocabulary', () => {
    expect(noExpected('le gusta nadar en el mar.', ['le', 'mar']).verdict).toBe('ok');
    expect(noExpected('no lo sé.', ['le', 'mar']).verdict).toBe('miss');
  });

  /** But the case fix applies there too — that bug was independent of the answer comparison. */
  it('is still case-insensitive on that path', () => {
    expect(noExpected('Le gusta nadar en el mar.', ['le']).wordsHit).toEqual(['le']);
  });
});

describe('a non-answer is still a miss', () => {
  it('rejects something too short to be a sentence', () => {
    expect(grade('si').verdict).toBe('miss');
  });

  it('rejects an answer about something else entirely', () => {
    const g = grade('Pedro tiene un abrigo pesado en el armario.');
    expect(g.verdict).toBe('miss');
  });
});
