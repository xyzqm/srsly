import { describe, it, expect } from 'vitest';
import { joinPinyin, toneNumToMark, checkPinyin, toneOf, splitSyllables, tonedSyllables, stripTones } from '@/lib/pinyin';
import CEDICT from '@dict/cedict.json';

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

/**
 * TONES, AND SPLITTING A READING INTO THE SYLLABLES THAT CARRY THEM.
 *
 * The splitter exists so `péngyou` can be coloured as two tones rather than one. It is held to
 * the REAL CC-CEDICT below, which is how the missing `ue` final was found: without it `xué`
 * could not match and fell apart into `xu` + `é`, putting tone 2 on the wrong half of 學, 月 and
 * every word containing them — 1,431 entries, and invisible to any hand-written test case
 * somebody happened to think of.
 */
describe('toneOf', () => {
  it('reads the four marks and treats an unmarked syllable as neutral', () => {
    expect(toneOf('mā')).toBe(1);
    expect(toneOf('má')).toBe(2);
    expect(toneOf('mǎ')).toBe(3);
    expect(toneOf('mà')).toBe(4);
    expect(toneOf('ma')).toBe(5);
    expect(toneOf('')).toBe(5);
  });

  it('is the exact inverse of stripTones, not a second table', () => {
    // Every marked vowel stripTones removes, toneOf must be able to name.
    for (const [syl, tone] of [['lǜ', 4], ['nǚ', 3], ['ǎi', 3], ['ōu', 1], ['ér', 2]] as const) {
      expect(toneOf(syl)).toBe(tone);
      expect(stripTones(syl)).not.toMatch(/[̀-ͯ]/);
    }
  });

  it('finds the mark wherever in the syllable it sits', () => {
    expect(toneOf('zhuàng')).toBe(4);     // late
    expect(toneOf('ān')).toBe(1);         // first character
  });
});

describe('splitSyllables', () => {
  it('splits a multi-syllable reading', () => {
    expect(splitSyllables('péngyou')).toEqual(['péng', 'you']);
    expect(splitSyllables('zhōngguó')).toEqual(['zhōng', 'guó']);
    expect(splitSyllables('xīn')).toEqual(['xīn']);
  });

  it('keeps ue syllables whole — the bug the dictionary sweep found', () => {
    expect(splitSyllables('xué')).toEqual(['xué']);
    expect(splitSyllables('yuè')).toEqual(['yuè']);
    expect(splitSyllables('jué')).toEqual(['jué']);
    expect(splitSyllables('què')).toEqual(['què']);
    // and in context, where the damage actually showed
    expect(splitSyllables('shàngxué')).toEqual(['shàng', 'xué']);
    expect(splitSyllables('sānyuè')).toEqual(['sān', 'yuè']);
  });

  it('treats the apostrophe as the boundary it is', () => {
    // Hanyu Pinyin writes one precisely because xian and xi'an are different words.
    expect(splitSyllables('xi’ān')?.filter(p => /\w/.test(p))).toEqual(['xi', 'ān']);
    expect(splitSyllables('xiān')).toEqual(['xiān']);
  });

  it('preserves spaces, which separate WORDS in the HSK tables', () => {
    expect(splitSyllables('dǎ diànhuà')).toEqual(['dǎ', ' ', 'diàn', 'huà']);
  });

  it('returns null rather than guessing at something that is not pinyin', () => {
    expect(splitSyllables('bchāo')).toBeNull();     // B超 — a Latin letter, not a syllable
    expect(splitSyllables('')).toBeNull();
    expect(splitSyllables('xyzzy')).toBeNull();
  });

  it('tonedSyllables pairs each piece with its own tone', () => {
    expect(tonedSyllables('péngyou')).toEqual([
      { text: 'péng', tone: 2 },
      { text: 'you', tone: 5 },
    ]);
    expect(tonedSyllables('qwerty')).toBeNull();
  });
});

describe('the splitter against the real CC-CEDICT', () => {
  it('splits ≥99% of Han entries into one syllable per character', () => {
    const d = CEDICT as unknown as Record<string, { p: string }>;
    let total = 0, ok = 0, refused = 0;
    for (const [h, e] of Object.entries(d)) {
      if (!e?.p || !/^[一-鿿]+$/.test(h)) continue;
      total++;
      const parts = splitSyllables(e.p);
      if (!parts) { refused++; continue; }
      const sylls = parts.filter(p => /\S/.test(p) && !/^['’·]+$/.test(p));
      if (sylls.length === [...h].length) ok++;
    }
    expect(total).toBeGreaterThan(100_000);
    // Measured 99.44%. The residual is erhua (个儿 gèr really is one syllable for two
    // characters) and the metric abbreviations (兙 shíkè), neither of which is a wrong tone.
    expect(ok / total).toBeGreaterThan(0.99);
    // A refusal renders uncoloured, which costs nothing — so it only has to stay rare.
    expect(refused / total).toBeLessThan(0.01);
  });

  it('CONTROL: removing the ue final collapses the rate, which is how it was caught', () => {
    // 學 is the canonical victim: without `ue` it splits as xu|é and tone 2 lands on `é`.
    const parts = splitSyllables('xué');
    expect(parts).toEqual(['xué']);
    expect(parts && parts.length).toBe(1);        // not 2 — the bug produced ['xu','é']
    expect(toneOf(parts![0])).toBe(2);
  });
});
