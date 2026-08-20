import { describe, it, expect } from 'vitest';
import { tokensToText, needsSpaceBefore } from '@/lib/tokenText';
import { splitSentences } from '@/lib/server/sentenceSplit';
import type { PassageToken } from '@/lib/types';

/**
 * Punctuation is recognised by `type: 'punct'`, NOT by the character — the segmenters set it
 * (a single-element RawTok is punctuation by definition) and the spacing rules read it. A
 * token that looks like punctuation but lacks the type gets spaced like a word, so the
 * fixture has to mark it the way the real pipeline does.
 */
const PUNCT = /^[.,;:!?¡¿«»""''()[\]{}…。、！？]+$/;
const t = (...words: string[]): PassageToken[] =>
  words.map(text => (PUNCT.test(text) ? { text, type: 'punct' as const } : { text }));

/**
 * Spacing has broken twice — once rendering "¿Quetalelclimahoy?" into the passage shelf, and
 * once in the shelf's own stored text. CLAUDE.md's rule is that every renderer goes through
 * this module, so this is where the rule is actually enforced.
 */
describe('tokensToText', () => {
  it('joins a spaced language with spaces', () => {
    expect(tokensToText(t('El', 'camarón', 'está', 'aquí'), false)).toBe('El camarón está aquí');
  });

  it('joins an unspaced script flush', () => {
    expect(tokensToText(t('学生', '们', '在', '学校'), true)).toBe('学生们在学校');
  });

  it('puts no space before closing punctuation', () => {
    expect(tokensToText(t('Hola', ',', 'María', '.'), false)).toBe('Hola, María.');
  });

  it('puts no space after an opening mark', () => {
    expect(tokensToText(t('¿', 'Qué', 'tal', '?'), false)).toBe('¿Qué tal?');
    expect(tokensToText(t('¡', 'Hola', '!'), false)).toBe('¡Hola!');
  });

  it('needsSpaceBefore never spaces the first token', () => {
    expect(needsSpaceBefore(t('El', 'mar'), 0, false)).toBe('');
  });

  it('spacing keys on the punct TYPE, not on the character', () => {
    // Same characters, no type: they are spaced like ordinary words. This is what a
    // hand-built fixture — or a segmenter that forgot to tag — actually produces.
    const untyped: PassageToken[] = [{ text: '¿' }, { text: 'Qué' }, { text: '?' }];
    expect(tokensToText(untyped, false)).toBe('¿ Qué ?');
  });
});

describe('splitSentences', () => {
  it('splits Latin prose on terminators followed by space', () => {
    expect(splitSentences('Uno. Dos! Tres?', false)).toEqual(['Uno.', 'Dos!', 'Tres?']);
  });

  it('does not split inside a decimal or a domain', () => {
    expect(splitSentences('Cuesta 1.500 euros en www.example.com hoy.', false))
      .toEqual(['Cuesta 1.500 euros en www.example.com hoy.']);
  });

  it('treats an initial as part of the name, not a boundary', () => {
    expect(splitSentences('Lo escribió J. K. Rowling ayer.', false))
      .toEqual(['Lo escribió J. K. Rowling ayer.']);
  });

  it('splits CJK on its own terminators', () => {
    expect(splitSentences('我去学校。他在家！你呢？', true)).toEqual(['我去学校。', '他在家！', '你呢？']);
  });

  it('treats a line break as a hard boundary', () => {
    expect(splitSentences('Un título\nY el cuerpo.', false)).toEqual(['Un título', 'Y el cuerpo.']);
  });
});
