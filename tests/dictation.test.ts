import { describe, it, expect } from 'vitest';
import { dictationSentences, splitAtBlank, sentenceRevealed } from '@/lib/dictation';
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
