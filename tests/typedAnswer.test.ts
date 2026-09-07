import { describe, it, expect } from 'vitest';
import hskVocab from '@data/hsk-vocab.json';
import jlptVocab from '@data/jlpt-vocab.json';
import { gradeTyped, expectedAnswer, answerReading, canType } from '@/lib/typedAnswer';

/**
 * Typed recall, graded against the REAL dictionaries.
 *
 * The claims are about the LANGUAGES, not the arithmetic — that `pengyou` is the right word
 * with the keyboard in the wrong mode, that `ano` is not a near miss for `año` — so a fixture
 * would only test the normalizer against itself.
 *
 * ── THIS FILE REPLACED AN EARLIER ONE THAT ASSERTED THE OPPOSITE ──
 * The previous design faced Chinese and Japanese forward (character shown, reading typed) and
 * these tests pinned that. The app now asks one question in every language — meaning shown,
 * word typed, CJK entered with the learner's own IME — so the old assertions were not merely
 * stale, they were claims about a design that no longer exists.
 */

const hsk = hskVocab as unknown as Record<string, { pinyin: string; meaning: string }>;
const jlpt = jlptVocab as unknown as Record<string, { reading: string; meaning: string }>;

describe('one question in every language: the answer is the word', () => {
  it('asks for the word itself, never a romanisation', () => {
    expect(expectedAnswer({ h: '朋友' })).toBe('朋友');
    expect(expectedAnswer({ h: '食べる' })).toBe('食べる');
    expect(expectedAnswer({ h: 'comer' })).toBe('comer');
  });

  it('exposes the reading separately, for the near-miss tier only', () => {
    expect(answerReading({ p: 'péngyou' })).toBe('péngyou');
    expect(answerReading({ p: '' })).toBe('');
  });

  /** A word always has its own text; only a malformed card could fail this. */
  it('refuses a card with no word', () => {
    expect(canType({ h: '' })).toBe(false);
    expect(canType({ h: '   ' })).toBe(false);
    expect(canType({ h: '朋友' })).toBe(true);
  });
});

describe('Chinese: characters are the answer, pinyin is the near miss', () => {
  const zh = (typed: string, want = '朋友', reading = 'péngyou') =>
    gradeTyped(typed, want, 'zh', reading).verdict;

  it('accepts the characters', () => {
    expect(zh('朋友')).toBe('exact');
    expect(zh(' 朋友 ')).toBe('exact');
  });

  /**
   * THE FORGOTTEN-KEYBOARD TIER. An IME is driven with toneless pinyin, so that is exactly
   * what lands in the box when the learner never switched keyboards. They knew the word; they
   * failed to produce the script, which is a near miss and not a lapse.
   */
  it('treats typed pinyin as a near miss, with or without tones', () => {
    expect(zh('pengyou')).toBe('close');
    expect(zh('péngyou')).toBe('close');
    expect(zh('peng2you5')).toBe('close');
  });

  it('calls a different word wrong', () => {
    expect(zh('你好')).toBe('wrong');
    expect(zh('nihao')).toBe('wrong');
    expect(zh('')).toBe('wrong');
  });

  /** A full-width Latin letter is the same answer — CJK keyboards emit them in the wrong mode. */
  it('folds full-width forms', () => {
    expect(gradeTyped('ＯＫ', 'OK', 'zh').verdict).toBe('exact');
  });

  /** Every HSK word must accept its own characters, and its own pinyin as a near miss. */
  it('holds over the whole HSK vocabulary', () => {
    let exact = 0, close = 0, total = 0;
    for (const [word, entry] of Object.entries(hsk)) {
      if (!entry.pinyin) continue;
      total++;
      if (gradeTyped(word, word, 'zh', entry.pinyin).verdict === 'exact') exact++;
      if (gradeTyped(entry.pinyin, word, 'zh', entry.pinyin).verdict === 'close') close++;
    }
    expect(exact).toBe(total);
    expect(close).toBe(total);
    expect(total).toBeGreaterThan(4900);
  });
});

describe('Japanese: kanji are the answer, unconverted kana is the near miss', () => {
  const ja = (typed: string, want: string, reading: string) =>
    gradeTyped(typed, want, 'ja', reading).verdict;

  it('accepts the written form', () => {
    expect(ja('食べる', '食べる', 'たべる')).toBe('exact');
    expect(ja('コーヒー', 'コーヒー', 'コーヒー')).toBe('exact');
  });

  /**
   * The realistic miss is NOT romaji — with an IME on you never see it. It is pressing Enter
   * on たべる before pressing space to reach 食べる.
   */
  it('treats unconverted kana as a near miss', () => {
    expect(ja('たべる', '食べる', 'たべる')).toBe('close');
    expect(ja('がっこう', '学校', 'がっこう')).toBe('close');
  });

  /**
   * A LOANWORD IN HIRAGANA IS NOT THE SAME SPELLING, and the grader is right to say so.
   * コーヒー is written in katakana; こーひー is not an alternative spelling of it, it is the
   * reading typed in the wrong script — which is precisely the near-miss tier. The long mark
   * and the kana script both fold on that side, so every way of writing the sound lands there
   * together rather than some of them falling through to `wrong`.
   */
  it('treats a katakana word typed in hiragana as a near miss, however it is spelled', () => {
    expect(ja('こーひー', 'コーヒー', 'コーヒー')).toBe('close');
    expect(ja('こおひい', 'コーヒー', 'コーヒー')).toBe('close');
    expect(ja('コオヒイ', 'コーヒー', 'コーヒー')).toBe('close');
  });

  it('calls a different word wrong', () => {
    expect(ja('犬', '猫', 'ねこ')).toBe('wrong');
  });

  it('holds over the whole JLPT vocabulary', () => {
    const bad: string[] = [];
    let close = 0, withKanji = 0;
    for (const [word, entry] of Object.entries(jlpt)) {
      if (!entry.reading) continue;
      if (gradeTyped(word, word, 'ja', entry.reading).verdict !== 'exact') bad.push(word);
      if (word !== entry.reading) {
        withKanji++;
        if (gradeTyped(entry.reading, word, 'ja', entry.reading).verdict === 'close') close++;
      }
    }
    expect(bad).toEqual([]);
    expect(close).toBe(withKanji);
    expect(withKanji).toBeGreaterThan(6000);
  });
});

describe('Spanish and French: accents forgive, ñ does not', () => {
  const es = (t: string, w: string) => gradeTyped(t, w, 'es').verdict;
  const fr = (t: string, w: string) => gradeTyped(t, w, 'fr').verdict;

  it('accepts the word, ignoring case and padding', () => {
    expect(es('comer', 'comer')).toBe('exact');
    expect(es('  COMER ', 'comer')).toBe('exact');
  });

  it('treats a missing accent as a near miss', () => {
    expect(es('estacion', 'estación')).toBe('close');
    expect(fr('etre', 'être')).toBe('close');
    expect(fr('garcon', 'garçon')).toBe('close');
  });

  /** año/ano is the pair every learner is warned about; grading it a near miss teaches it. */
  it('never folds ñ', () => {
    expect(es('ano', 'año')).toBe('wrong');
    expect(es('espanol', 'español')).toBe('wrong');
    expect(es('año', 'año')).toBe('exact');
  });

  /** There is no reading to fall back on, so nothing accidental can reach `close`. */
  it('has no reading tier', () => {
    expect(gradeTyped('komer', 'comer', 'es', '').verdict).toBe('wrong');
  });
});

describe('the near-miss tier cannot fire without a reading', () => {
  it('grades a missing reading as wrong rather than throwing', () => {
    expect(gradeTyped('pengyou', '朋友', 'zh').verdict).toBe('wrong');
    expect(gradeTyped('pengyou', '朋友', 'zh', '').verdict).toBe('wrong');
  });

  /** An empty answer is how this screen spells "I don't know". */
  it('grades an empty answer wrong in every language', () => {
    for (const lang of ['zh', 'ja', 'es', 'fr'] as const) {
      expect(gradeTyped('', 'x', lang, 'y').verdict).toBe('wrong');
    }
  });
});
