import { describe, it, expect } from 'vitest';
import { joinPinyin, toneNumToMark, checkPinyin } from '@/lib/pinyin';

/**
 * The syllable-dividing apostrophe. Without it 可爱 rendered `kěài`, where Hanyu Pinyin
 * orthography writes `kě'ài` — the boundary is genuinely ambiguous otherwise, which is the
 * whole reason the convention exists.
 */
describe('joinPinyin inserts the syllable-dividing apostrophe', () => {
  it('divides before a, o and e', () => {
    expect(joinPinyin(['ke3', 'ai4'])).toBe("kě'ài");          // 可爱
    expect(joinPinyin(['xi1', 'an1'])).toBe("xī'ān");          // 西安
    expect(joinPinyin(['tian1', 'an1', 'men2'])).toBe("tiān'ānmén"); // 天安门
    expect(joinPinyin(['ping2', 'an1'])).toBe("píng'ān");      // 平安
    expect(joinPinyin(['fang1', 'an4'])).toBe("fāng'àn");      // 方案
  });

  it('leaves consonant-initial syllables alone', () => {
    expect(joinPinyin(['bei3', 'jing1'])).toBe('běijīng');
    expect(joinPinyin(['wo3', 'men5'])).toBe('wǒmen');
    expect(joinPinyin(['zhong1', 'wen2'])).toBe('zhōngwén');
    expect(joinPinyin(['lao3', 'shi1'])).toBe('lǎoshī');
  });

  // The apostrophe marks a boundary between syllables, so a word-initial vowel never takes one.
  it('never starts a word with an apostrophe', () => {
    expect(joinPinyin(['ai4'])).toBe('ài');
    expect(joinPinyin(['e4', 'xin1'])).toBe('èxīn');
    expect(joinPinyin(['ou3', 'ran2'])).toBe('ǒurán');
  });

  it('handles a single syllable and an empty word', () => {
    expect(joinPinyin(['ma1'])).toBe('mā');
    expect(joinPinyin([])).toBe('');
  });

  it('agrees with toneNumToMark on each syllable', () => {
    for (const s of ['ke3', 'ai4', 'lv4', 'nv3', 'er2', 'men5']) {
      expect(joinPinyin([s])).toBe(toneNumToMark(s));
    }
  });
});

/**
 * The apostrophe changes how pinyin is WRITTEN, never what it matches — otherwise adding it
 * would silently break every deck word, import and polyphone check that compares readings.
 * `checkPinyin` is the real consumer: it returns a warning string on a mismatch, null on a
 * match, and canonicalises through the same path everything else does.
 */
describe('adding apostrophes cannot break pinyin matching', () => {
  it('an apostrophised reading still matches the same reading without one', () => {
    expect(checkPinyin("kě'ài", '可爱', ['kěài'])).toBeNull();
    expect(checkPinyin('kěài', '可爱', ["kě'ài"])).toBeNull();
  });

  it('still matches the tone-numbered form it came from', () => {
    expect(checkPinyin(joinPinyin(['ke3', 'ai4']), '可爱', ['ke3ai4'])).toBeNull();
  });

  it('does not make genuinely different readings match', () => {
    expect(checkPinyin("kě'ài", '可爱', ['hǎokàn'])).not.toBeNull();
  });
});
