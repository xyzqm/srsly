import { describe, it, expect } from 'vitest';
import { segmentFr } from '@/lib/server/frenchSegmenter';
import { needsSpaceBefore } from '@/lib/tokenText';
import type { PassageToken } from '@/lib/types';

/**
 * Hyphens in French do two opposite jobs, and the segmenter has to tell them apart.
 *
 * Most hyphens BUILD a word: `grand-père`, `arc-en-ciel`, `porte-monnaie`. Splitting those
 * would be worse than the bug being fixed. A few ATTACH a pronoun to a verb — inversion
 * questions and imperatives — and leaving those joined meant `est-ce` and `viens-tu` resolved
 * to nothing at all, so tapping the most common question form in the language did nothing.
 *
 * The dictionary is what separates them, which is why these run against the REAL one.
 */
const toks = (s: string) => segmentFr(s, new Map());
const words = (s: string) => toks(s).filter(t => t.length > 1);
const texts = (s: string) => toks(s).map(t => t[0]);

/** Rebuild the sentence the way every renderer and TTS does, through the shared rules. */
function render(sentence: string): string {
  const tokens: PassageToken[] = toks(sentence).map(t => ({
    text: t[0],
    reading: t[1],
    meaning: t[2],
    baseForm: t[3],
    type: t.length === 1 ? ('punct' as const) : undefined,
  }));
  return tokens.map((_, i) => needsSpaceBefore(tokens, i, false) + tokens[i].text).join('');
}

describe('hyphenated compounds stay whole', () => {
  // Every one of these is a dictionary headword, which is what keeps it together — the clitic
  // list alone would tear `rendez-vous` apart, since `vous` is a clitic.
  it.each([
    'grand-père', 'rendez-vous', 'peut-être', 'arc-en-ciel',
    'celui-ci', 'vis-à-vis', 'au-delà', 'porte-monnaie', 'sous-sol',
  ])('%s is one token', word => {
    expect(texts(word)).toEqual([word]);
  });

  it('keeps a compound whole and still defines it', () => {
    const [tok] = words('grand-père');
    expect(tok[0]).toBe('grand-père');
    expect(tok[2]).toBeTruthy();
  });
});

describe('inversion and imperative clitics are split off', () => {
  it('splits an est-ce question so both halves resolve', () => {
    const t = words('est-ce');
    expect(t.map(x => x[0])).toEqual(['est', '-ce']);
    expect(t[0][3], 'est should link to être').toBe('être');
    expect(t[1][3], '-ce should link to the ce card').toBe('ce');
    for (const tok of t) expect(tok[2], `${tok[0]} has no definition`).toBeTruthy();
  });

  it.each([
    ['viens-tu', ['viens', '-tu']],
    ['parles-tu', ['parles', '-tu']],
    ['donne-moi', ['donne', '-moi']],
    ['dis-moi', ['dis', '-moi']],
  ])('%s splits into %j', (input, expected) => {
    const t = words(input);
    expect(t.map(x => x[0])).toEqual(expected);
    for (const tok of t) expect(tok[2], `${tok[0]} has no definition`).toBeTruthy();
  });

  it('links the verb to its dictionary form', () => {
    expect(words('viens-tu')[0][3]).toBe('venir');
    expect(words('parles-tu')[0][3]).toBe('parler');
  });

  /**
   * `donne` is itself a headword ("dealing of cards"), so the lemmatizer deliberately leaves
   * it alone rather than resolving it to `donner` — the documented homograph rule. Splitting
   * still has to work, and the piece still has to carry a definition; what it must NOT do is
   * override that judgement just because a clitic was attached.
   */
  it('does not override the lemmatizer on a homograph head', () => {
    const [head] = words('donne-moi');
    expect(head[0]).toBe('donne');
    expect(head[2]).toBeTruthy();
  });

  /**
   * `allons-y` and `vas-y` are dictionary headwords in their own right — "first-person plural
   * imperative of y aller". The dictionary getting first refusal is what keeps them whole, and
   * a whole-phrase definition is better than two halves.
   */
  it.each(['allons-y', 'vas-y'])('%s is a set phrase and stays whole', phrase => {
    expect(texts(phrase)).toEqual([phrase]);
    expect(words(phrase)[0][2]).toBeTruthy();
  });

  /**
   * The euphonic `t` is not a word. Splitting on every hyphen would emit it as its own token
   * and leave the reader tapping a `t` no dictionary can define.
   */
  it('peels -t-il as one unit rather than emitting a bare t', () => {
    const t = words('parle-t-il');
    expect(t.map(x => x[0])).toEqual(['parle', '-t-il']);
    expect(t.map(x => x[0])).not.toContain('t');
    expect(t[1][3]).toBe('il');
    expect(t[1][2]).toBeTruthy();
  });

  it('handles a sentence-initial capital', () => {
    const t = words('Est-ce que tu parles français ?');
    expect(t[0][0]).toBe('Est');
    expect(t[1][0]).toBe('-ce');
    expect(t[0][3]).toBe('être');
  });
});

describe('a word is only split when both halves mean something', () => {
  // The head has to resolve, or an unknown compound whose tail looks like a pronoun would be
  // torn in half into two pieces that mean nothing.
  it('leaves a hyphenated word alone when the head is not a word', () => {
    expect(texts('zzqq-tu')).toEqual(['zzqq-tu']);
  });

  it('leaves a compound alone when the tail is not a clitic', () => {
    expect(texts('chef-zzqq')).toEqual(['chef-zzqq']);
  });
});

/**
 * THE RENDERING HALF. Splitting a token is only safe if the sentence still reads back
 * identically — the passage, the cloze text and the TTS plaintext all flatten through
 * `needsSpaceBefore`, so a clitic that does not hug its verb would show and SPEAK as two
 * separate words.
 */
describe('the sentence reads back exactly as it was written', () => {
  /**
   * French puts a space before `? ! ; :` and `splitPieces` drops it, saying it is "put back at
   * render time by the shared spacing rules" — but `needsSpaceBefore` returns '' for every
   * non-opening mark, so it never is. That is a PRE-EXISTING gap, unrelated to clitics and
   * equally true when `Parle-t-il` was a single token; fixing it needs the language plumbed
   * into the spacing rules, since Spanish must not gain the space. Normalised away here so
   * this test measures the hyphens, and asserted on its own below so it is not hidden.
   */
  const frenchPrePunctSpace = (s: string) => s.replace(/ ([?!;:])/g, '$1');

  it.each([
    'Est-ce que tu parles français ?',
    'Viens-tu avec nous ?',
    'Parle-t-il français ?',
    'Donne-moi le livre.',
    'Mon grand-père a un arc-en-ciel.',
    'Le rendez-vous est peut-être au sous-sol.',
  ])('%s', sentence => {
    expect(render(sentence)).toBe(frenchPrePunctSpace(sentence));
  });

  it('every clitic hugs its verb, which is the part splitting could have broken', () => {
    expect(render('Est-ce que tu viens ?')).toContain('Est-ce');
    expect(render('Parle-t-il ?')).toContain('Parle-t-il');
    expect(render('Donne-moi le livre.')).toContain('Donne-moi');
  });

  // Recorded, not fixed — see the note above.
  it('KNOWN GAP: does not restore the French space before ? ! ; :', () => {
    expect(render('Viens-tu ?')).toBe('Viens-tu?');
  });

  it('does not glue a standalone dash, which is ordinary punctuation', () => {
    // One character, so the clitic rule does not fire and the old spacing is untouched.
    const tokens: PassageToken[] = [
      { text: 'a' }, { text: '-', type: 'punct' }, { text: 'b' },
    ];
    expect(needsSpaceBefore(tokens, 2, false)).toBe(' ');
  });
});

describe('the words a lesson needs now resolve', () => {
  // Both were listed in tests/lessons.test.ts as known gaps.
  it('defines au, which the contraction filter used to delete', () => {
    const [tok] = words('au');
    expect(tok[2]).toBeTruthy();
  });

  it('defines both halves of est-ce', () => {
    for (const tok of words('est-ce')) expect(tok[2], tok[0]).toBeTruthy();
  });
});
