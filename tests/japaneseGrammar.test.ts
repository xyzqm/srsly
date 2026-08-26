import { describe, it, expect } from 'vitest';
import { describeChain, encodeChain } from '@/lib/japaneseGrammar';
import { segmentJa } from '@/lib/server/kuromojiSegmenter';

/**
 * Japanese is decoded COMPOSITIONALLY from the auxiliary chain rather than looked up in a
 * table, because its morphology is productive: 食べる stacks into 食べさせられたくなかった and
 * no finite table can enumerate that. These run through the REAL analyzer for the same reason
 * the other language tests use real data — the claim is about what kuromoji actually emits.
 */
describe('the chain decodes to what the ending is doing', () => {
  it.each([
    ['ます|た', 'polite · past'],
    ['ます', 'polite'],
    ['た', 'past'],
    ['ない', 'negative'],
    ['たい', 'want to'],
    ['ない|た', 'negative · past'],
    ['て|いる', 'ongoing'],
    ['て|いる|ます', 'ongoing · polite'],
    ['させる', 'causative'],
  ])('%s reads as "%s"', (chain, expected) => {
    expect(describeChain(chain)).toBe(expected);
  });

  /**
   * れる/られる is passive, potential AND honorific at once, and the ending cannot tell them
   * apart. Naming one would be a coin flip presented to a beginner as a fact — the same rule
   * that stops the Spanish decoder naming a person for `hablaba`.
   */
  it('does not pick between passive and potential', () => {
    expect(describeChain('られる')).toBe('passive or potential');
    expect(describeChain('れる')).toBe('passive or potential');
  });

  it('handles a stack no table could enumerate', () => {
    expect(describeChain('させる|られる|たい|ない|た'))
      .toBe('causative · passive or potential · want to · negative · past');
  });

  /** て is a JOIN, not a feature: what it means depends on what attaches to it. */
  it('reads て by what follows it', () => {
    expect(describeChain('て')).toMatch(/te-form/);
    expect(describeChain('て|いる')).toBe('ongoing');
    expect(describeChain('て|くださる')).toBe('please — a request');
    expect(describeChain('て|しまう')).toBe('done completely');
  });

  it('treats で as て, since that is the same join after a voiced stem', () => {
    expect(describeChain('で|いる')).toBe('ongoing');
  });

  it('returns null rather than inventing a description', () => {
    for (const c of ['', '|', 'ぞ', 'まったく|でたらめ']) expect(describeChain(c), c).toBeNull();
  });

  it('round-trips through encodeChain', () => {
    expect(describeChain(encodeChain(['ます', 'た']))).toBe('polite · past');
  });
});

describe('the segmenter emits a chain the decoder can read', () => {
  const chainOf = async (sentence: string, surface: string) => {
    const toks = await segmentJa(sentence, new Map());
    return toks.find(t => t[0] === surface)?.[4];
  };

  it.each([
    ['本を読みました。', '読みました', 'polite · past'],
    ['使っています。', '使っています', 'ongoing · polite'],
    ['行かない。', '行かない', 'negative'],
    ['見たい。', '見たい', 'want to'],
    ['東京に住んでいます。', '住んでいます', 'ongoing · polite'],
    ['食べさせられたくなかった。', '食べさせられたくなかった',
      'causative · passive or potential · want to · negative · past'],
  ])('%s → %s reads "%s"', async (sentence, surface, expected) => {
    const chain = await chainOf(sentence, surface);
    expect(chain, `${surface} carried no chain`).toBeTruthy();
    expect(describeChain(chain!)).toBe(expected);
  }, 60_000);

  /**
   * A clause-joining て must not swallow the next clause — the fusion pass stops there
   * deliberately, and the chain has to stop with it.
   */
  it('stops at a clause-joining て', async () => {
    const toks = await segmentJa('食べて、飲みました。', new Map());
    expect(toks.find(t => t[0] === '食べて')?.[4]).toBe('て');
    expect(toks.find(t => t[0] === '飲みました')?.[4]).toBe('ます|た');
  }, 60_000);

  /**
   * THE POTENTIAL IS NOT A DICTIONARY WORD. kuromoji hands back `話せる` as the base form, and
   * JMdict does not carry it — the potential is productive, so no dictionary lists them all.
   * Every "can do" verb therefore resolved to a blank definition until the segmenter unwound
   * the -eru stem back to the plain verb.
   */
  it.each([
    ['日本語が話せます。', '話せます', '話す'],
    ['漢字が読めません。', '読めません', '読む'],
    ['早く行けます。', '行けます', '行く'],
  ])('%s links %s to the plain verb %s', async (sentence, surface, plain) => {
    const t = (await segmentJa(sentence, new Map())).find(x => x[0] === surface);
    expect(t?.[3], `${surface} did not link to ${plain}`).toBe(plain);
    expect(t?.[2], `${surface} has no definition`).toBeTruthy();
    expect(describeChain(t![4]!)).toContain('can, potential');
  }, 60_000);

  /**
   * The guard that stops it mangling ordinary verbs: an ichidan verb ending in -eru is a real
   * headword and resolves before the potential rule is reached. Without it 食べる would be
   * "recovered" to 食ぶ and 見せる to 見す.
   */
  it.each([['食べます。', '食べます', '食べる'], ['見せます。', '見せます', '見せる']])(
    '%s leaves %s alone', async (sentence, surface, base) => {
      const t = (await segmentJa(sentence, new Map())).find(x => x[0] === surface);
      expect(t?.[3]).toBe(base);
      expect(describeChain(t![4]!)).not.toContain('potential');
    }, 60_000);

  /** An uninflected word has no chain, and the 5th slot never appears without the 4th. */
  it('attaches nothing to a plain noun', async () => {
    for (const t of await segmentJa('本を読みました。', new Map())) {
      if (t[0] === '本' || t[0] === 'を') expect(t.length).toBeLessThan(5);
      if (t.length === 5) expect(t[3], 'a chain without a base form').toBeTruthy();
    }
  }, 60_000);
});
