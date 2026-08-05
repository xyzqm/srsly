import type { PassageToken } from './types';

/**
 * Shared detokenization rules — how a token array turns back into readable text.
 *
 * The segmenters drop whitespace (it carries no information once the sentence is split),
 * so it has to be put back at render time. Every surface that renders tokens must use
 * these helpers: rendering them flush together is correct for Chinese and Japanese but
 * produces "Au Moyen Âge ,les rois" and "royaume ." for the spaced languages.
 */

/**
 * Punctuation that OPENS something: it takes a space BEFORE and none after. Covers the
 * Spanish inverted marks and the usual brackets and quotes.
 */
const OPENING_PUNCT = new Set(['¿', '¡', '«', '(', '[', '{', '“', '‘']);

/**
 * Whether a space belongs before token `ti`.
 *
 * Unspaced scripts (zh, ja) never get one — their tokens butt together the way the script
 * is actually written. Spaced scripts get a space between words, but not before closing
 * punctuation and not after an opening mark, so `¿Dónde está la biblioteca?` keeps its
 * marks tight against the words and a comma never floats away from the word it follows.
 */
export function needsSpaceBefore(
  tokens: PassageToken[],
  ti: number,
  scriptIsUnspaced: boolean,
): string {
  if (scriptIsUnspaced || ti === 0) return '';
  const token = tokens[ti];
  const prev = tokens[ti - 1];
  if (!token || !prev) return '';
  if (token.type === 'punct' && !OPENING_PUNCT.has(token.text)) return '';
  if (prev.type === 'punct' && OPENING_PUNCT.has(prev.text)) return '';
  return ' ';
}

/**
 * Flatten tokens to plain text with the same spacing rules — for speech synthesis, answer
 * matching and anywhere else that needs the sentence as a string rather than as elements.
 */
export function tokensToText(tokens: PassageToken[], scriptIsUnspaced: boolean): string {
  return tokens
    .map((t, i) => needsSpaceBefore(tokens, i, scriptIsUnspaced) + t.text)
    .join('');
}
