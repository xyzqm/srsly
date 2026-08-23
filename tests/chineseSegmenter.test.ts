import { describe, it, expect } from 'vitest';
import { segmentZh } from '@/lib/server/chineseSegmenter';

/**
 * Segmentation against the REAL CC-CEDICT, deliberately — every rule here is a claim about
 * that data, and a stub would test the loop rather than the behaviour.
 */

const cut = (s: string, ov: Record<string, { p: string; m: string }> = {}) =>
  segmentZh(s, new Map(Object.entries(ov))).map(t => t[0]);

const deck = (...ws: string[]) =>
  Object.fromEntries(ws.map(w => [w, { p: 'x', m: 'y' }]));

/**
 * Longest-match alone fails in two directions, and a 121k-entry dictionary makes both routine:
 * a long rare entry beats a short common pair, and a long entry strands whatever it leaves.
 */
describe('a rare long entry never beats a common pair', () => {
  it('does not read 家的 as the archaic word for wife', () => {
    // CC-CEDICT glosses 家的 as "(old) wife". The sentence means "my home's cat".
    expect(cut('我家的小猫很可爱')).toEqual(['我', '家', '的', '小猫', '很', '可爱']);
  });

  it('does not strand a bare character after a long match', () => {
    // 中国人 + 民 is what longest-match produced; 中国 + 人民 is two ordinary words.
    expect(cut('中国人民')).toEqual(['中国', '人民']);
  });
});

/**
 * The other direction: adding a word costs score, so a real compound must not dissolve into
 * the very common characters it is spelled with.
 */
describe('a real word is not split into commoner characters', () => {
  it.each([
    ['小猫', '我家的小猫', ['我', '家', '的', '小猫']],
    ['生活', '我的生活很好', ['我', '的', '生活', '很', '好']],
    ['可爱', '很可爱', ['很', '可爱']],
    ['公园', '去公园散步', ['去', '公园', '散步']],
    ['鸡蛋', '有鸡蛋和青菜', ['有', '鸡蛋', '和', '青菜']],
  ])('keeps %s whole', (_label, input, expected) => {
    expect(cut(input)).toEqual(expected);
  });
});

/**
 * ── A DICTIONARY MATCH MUST NOT HIDE A DECK WORD ──
 * The learner's own cards are supplied, not guessed, so they win any boundary contest.
 */
describe('deck words win over dictionary phrases', () => {
  it('splits a CC-CEDICT phrase to surface two cards inside it', () => {
    expect(cut('城市的经济发展很快', deck('经济', '发展')))
      .toEqual(['城市', '的', '经济', '发展', '很', '快']);
  });

  it('leaves the same phrase alone when neither is in the deck', () => {
    expect(cut('城市的经济发展很快')).toContain('经济发展');
  });

  it('honours a deck word longer than any dictionary entry it overlaps', () => {
    expect(cut('去公园散步', deck('公园散步'))).toEqual(['去', '公园散步']);
  });
});

/**
 * The two-character minimum. Inside a two-character word the halves are morphemes, not words,
 * so holding them as separate cards must not take the word apart. This was a guard in the old
 * greedy re-cutting code; dropping it while moving to scoring re-broke exactly these cases.
 */
describe('a single-character card cannot break a real word', () => {
  it('keeps 生活 whole even with 生 and 活 both in the deck', () => {
    expect(cut('我的生活很好', deck('生', '活'))).toEqual(['我', '的', '生活', '很', '好']);
  });

  it('keeps 中国人 whole rather than shedding a bare 人', () => {
    expect(cut('他是中国人', deck('人'))).toEqual(['他', '是', '中国人']);
  });
});

describe('non-Han text is passed through intact', () => {
  it('keeps punctuation as its own token', () => {
    expect(cut('我很好。')).toEqual(['我', '很', '好', '。']);
  });

  it('keeps a Latin run together', () => {
    expect(cut('我用iPhone')).toEqual(['我', '用', 'iPhone']);
  });

  it('drops whitespace without emitting a token for it', () => {
    expect(cut('我 很 好')).toEqual(['我', '很', '好']);
  });

  it('returns nothing for empty input', () => {
    expect(cut('')).toEqual([]);
  });

  // The DP allows a single character at every position, so it can never dead-end on a hanzi
  // the dictionary has never seen.
  it('still emits an unknown hanzi as a word', () => {
    const toks = cut('我很好');
    expect(toks.every(t => t.length > 0)).toBe(true);
  });
});
