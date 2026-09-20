import { describe, it, expect } from 'vitest';
import { dictationSentences, splitAtBlank, sentenceRevealed, becameComplete } from '@/lib/dictation';
import type { Sentence, PassageToken } from '@/lib/types';

/**
 * Listening dictation's pure half.
 *
 * The interesting one is `splitAtBlank`, which feeds `speakWithBlank` for the hint button.
 * It has to produce text that agrees with what the passage renders, and the trap is that the
 * spacing rules read a token's NEIGHBOURS — so slicing the array first silently changes them.
 */

const w = (text: string, extra: Partial<PassageToken> = {}): PassageToken =>
  ({ text, meaning: 'x', type: 'vocab', ...extra });
const p = (text: string): PassageToken => ({ text, type: 'punct' });
const sent = (tokens: PassageToken[]): Sentence => ({ tokens, plainText: '' });

describe('which sentences are worth stopping on', () => {
  it('keeps only sentences carrying a blank', () => {
    const sentences = [
      sent([w('hola'), p('.')]),
      sent([w('yo'), w('como'), p('.')]),
      sent([w('la'), w('playa'), p('.')]),
    ];
    const isBlank = (_si: number, _ti: number, t: PassageToken) =>
      t.text === 'como' || t.text === 'playa';
    expect(dictationSentences(sentences, isBlank)).toEqual([
      { index: 1, blankTokenIdxs: [1] },
      { index: 2, blankTokenIdxs: [1] },
    ]);
  });

  /** A word is blanked in ALL of its occurrences, so one sentence can hold several. */
  it('records every blank in a sentence, not just the first', () => {
    const sentences = [sent([w('la'), w('playa'), w('y'), w('la'), w('playa')])];
    const isBlank = (_si: number, _ti: number, t: PassageToken) => t.text === 'playa';
    expect(dictationSentences(sentences, isBlank)).toEqual([{ index: 0, blankTokenIdxs: [1, 4] }]);
  });

  it('returns nothing when the passage has no blanks at all', () => {
    expect(dictationSentences([sent([w('hola')])], () => false)).toEqual([]);
  });
});

describe('splitting a sentence around one blank', () => {
  it('gives the spoken halves for a spaced script', () => {
    const tokens = [w('Me'), w('gusta'), w('la'), w('playa'), p('.')];
    expect(splitAtBlank(tokens, 3, false)).toEqual({ before: 'Me gusta la', after: '.' });
  });

  it('runs tokens together for an unspaced script', () => {
    const tokens = [w('我'), w('喜欢'), w('咖啡'), p('。')];
    expect(splitAtBlank(tokens, 2, true)).toEqual({ before: '我喜欢', after: '。' });
  });

  /**
   * THE TRAP. `¿` takes no space after it, and that rule is decided by looking at the token
   * BEFORE the current one — so slicing the array and flattening each half separately moves
   * every index and loses it. Walking the whole array keeps the two in step.
   */
  it('keeps an opening ¿ hugging the word after it', () => {
    const tokens = [p('¿'), w('Dónde'), w('está'), w('la'), w('playa'), p('?')];
    expect(splitAtBlank(tokens, 4, false).before).toBe('¿Dónde está la');
  });

  it('handles a blank at the very start', () => {
    const tokens = [w('Hola'), p(','), w('amigo')];
    expect(splitAtBlank(tokens, 0, false)).toEqual({ before: '', after: ', amigo' });
  });

  it('handles a blank at the very end', () => {
    const tokens = [w('Me'), w('gusta'), w('leer')];
    expect(splitAtBlank(tokens, 2, false)).toEqual({ before: 'Me gusta', after: '' });
  });
});

describe('when the text is revealed', () => {
  it('waits for every blank in the sentence', () => {
    const answered = new Set([1]);
    expect(sentenceRevealed([1, 4], ti => answered.has(ti))).toBe(false);
    answered.add(4);
    expect(sentenceRevealed([1, 4], ti => answered.has(ti))).toBe(true);
  });

  it('treats a sentence with no blanks as revealed', () => {
    expect(sentenceRevealed([], () => false)).toBe(true);
  });
});

describe('the run carries on by itself once a sentence is finished', () => {
  /**
   * Reported as "I don't like how the listening thing pauses at every sentence": every
   * sentence needed two clicks that carried no information — › then Play. Filling the last
   * blank already SAYS you are done with it.
   *
   * The whole rule is TRANSITION rather than STATE, and that is what these pin. It is not a
   * hypothetical distinction: reading "no blanks left" fires on a sentence finished ten
   * minutes ago that the learner has deliberately stepped BACK to, and shunts them straight
   * out of it again — so ‹ would look broken on exactly the sentences it is most useful on.
   */
  it('fires when the last blank on this sentence is answered', () => {
    expect(becameComplete({ stop: 0, unanswered: 1 }, { stop: 0, unanswered: 0 })).toBe(true);
  });

  it('does not fire while blanks are still open', () => {
    expect(becameComplete({ stop: 0, unanswered: 2 }, { stop: 0, unanswered: 1 })).toBe(false);
  });

  /** THE ONE THAT MATTERS: stepping back to a finished sentence is an arrival, not a finish. */
  it('does not fire on arriving at a sentence that was already complete', () => {
    expect(becameComplete({ stop: 2, unanswered: 1 }, { stop: 1, unanswered: 0 })).toBe(false);
    expect(becameComplete({ stop: 0, unanswered: 0 }, { stop: 1, unanswered: 0 })).toBe(false);
  });

  /** Nor on the first observation, where nothing has changed yet by definition. */
  it('does not fire on the first observation', () => {
    expect(becameComplete(null, { stop: 0, unanswered: 0 })).toBe(false);
  });

  /**
   * Idempotent across re-renders. React re-runs an effect for reasons that have nothing to do
   * with the learner, and an advance that fired twice would skip a sentence unheard.
   */
  it('does not fire twice for one completion', () => {
    const done = { stop: 0, unanswered: 0 };
    expect(becameComplete({ stop: 0, unanswered: 1 }, done)).toBe(true);
    expect(becameComplete(done, done)).toBe(false);
  });

  /** A sentence whose blanks reopen and close again is a second, real completion. */
  it('fires again if the sentence goes back to having blanks and is finished once more', () => {
    expect(becameComplete({ stop: 3, unanswered: 2 }, { stop: 3, unanswered: 0 })).toBe(true);
  });
});
