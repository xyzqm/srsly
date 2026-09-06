import { describe, it, expect } from 'vitest';
import hskVocab from '@data/hsk-vocab.json';
import jlptVocab from '@data/jlpt-vocab.json';
import {
  gradeTyped, typedOrientation, expectedAnswer, canType, answerScript, otherReading,
} from '@/lib/typedAnswer';
import { stripTones } from '@/lib/pinyin';

/**
 * Typed recall, graded against the REAL dictionaries.
 *
 * The claims here are about the LANGUAGES, not about the arithmetic — that a learner typing
 * `koohii` has produced コーヒー, that `pengyou` is the right word with the tone missing, that
 * `ano` is not a near miss for `año` — so a fixture would test the normalizer against itself.
 * Same reasoning the lemmatizer tests give for loading the real dictionary.
 *
 * The Japanese inputs below are the kana `wanakana` ACTUALLY produces, measured rather than
 * assumed. That measurement is the whole reason this module exists in the shape it does.
 */

const hsk = hskVocab as unknown as Record<string, { pinyin: string; meaning: string }>;
const jlpt = jlptVocab as unknown as Record<string, { reading: string; meaning: string }>;

describe('the orientation is decided by hasReadings, and is opposite in the two pairs', () => {
  it('shows the word and asks for the reading where a reading exists', () => {
    expect(typedOrientation('zh')).toBe('forward');
    expect(typedOrientation('ja')).toBe('forward');
  });

  /**
   * Spanish and French have no reading layer at all — `p` is empty by construction — so the
   * forward card has nothing to type. Getting this backwards would render an empty input.
   */
  it('shows the meaning and asks for the word where there is no reading', () => {
    expect(typedOrientation('es')).toBe('reverse');
    expect(typedOrientation('fr')).toBe('reverse');
  });

  it('takes the answer from the matching field', () => {
    expect(expectedAnswer({ h: '朋友', p: 'péngyou' }, 'zh')).toBe('péngyou');
    expect(expectedAnswer({ h: 'comer', p: '' }, 'es')).toBe('comer');
  });
});

describe('a card with no stored answer is not typed at all', () => {
  /**
   * An imported card can carry no pinyin. Grading an absent answer marks the learner wrong for
   * a gap in OUR data — the same mistake as rendering a loading state as an answer — so the
   * card falls back to reveal-and-self-grade instead.
   */
  it('refuses a Chinese card with no pinyin', () => {
    expect(canType({ h: '朋友', p: '' }, 'zh')).toBe(false);
    expect(canType({ h: '朋友', p: '   ' }, 'zh')).toBe(false);
    expect(canType({ h: '朋友', p: 'péngyou' }, 'zh')).toBe(true);
  });

  it('always accepts a Spanish card, whose answer is the word itself', () => {
    expect(canType({ h: 'comer', p: '' }, 'es')).toBe(true);
  });
});

describe('Chinese: tone numbers, ü, and the tone-slip tier', () => {
  const zh = (typed: string, want: string) => gradeTyped(typed, want, 'zh').verdict;

  it('accepts tone marks and tone numbers as the same answer', () => {
    expect(zh('péngyou', 'péngyou')).toBe('exact');
    expect(zh('peng2you5', 'péngyou')).toBe('exact');
    expect(zh('peng2 you5', 'péngyou')).toBe('exact');
    expect(zh('PÉNGYOU', 'péngyou')).toBe('exact');
  });

  /** How ü is typed on a keyboard that has no ü key, which is every keyboard a learner has. */
  it('accepts v and u: for ü', () => {
    expect(zh('lv4', 'lǜ')).toBe('exact');
    expect(zh('lü4', 'lǜ')).toBe('exact');
    expect(zh('nv3', 'nǚ')).toBe('exact');
    expect(zh('lu:4', 'lǜ')).toBe('exact');
  });

  it('calls the right syllables with the wrong tone a near miss, not a failure', () => {
    expect(zh('pengyou', 'péngyou')).toBe('close');
    expect(zh('peng2you2', 'péngyou')).toBe('close');
    expect(zh('qing', 'qíng')).toBe('close');
  });

  /**
   * ü IS A VOWEL, NOT A TONE. Folding it merges 女 nǚ into 努 nǔ, which are different
   * syllables — the same trap `lib/phoneticSeries.ts` documents, and it has to hold at the
   * forgiving tier too or the forgiveness swallows a real distinction.
   */
  it('never folds ü into u, even when forgiving tones', () => {
    expect(zh('nu', 'nǚ')).toBe('wrong');
    expect(zh('nu3', 'nǚ')).toBe('wrong');
    expect(zh('lu4', 'lǜ')).toBe('wrong');
  });

  it('calls a different word wrong', () => {
    expect(zh('nǐhǎo', 'péngyou')).toBe('wrong');
    expect(zh('', 'péngyou')).toBe('wrong');
  });

  /** Every HSK reading must grade itself exact, and its toneless form close. Nothing else. */
  it('holds over the whole HSK vocabulary', () => {
    let exact = 0, close = 0;
    for (const [, entry] of Object.entries(hsk)) {
      const p = entry.pinyin;
      if (!p) continue;
      if (gradeTyped(p, p, 'zh').verdict === 'exact') exact++;
      const flat = stripTones(p);
      const v = gradeTyped(flat, p, 'zh').verdict;
      if (v === 'exact' || v === 'close') close++;
    }
    const total = Object.values(hsk).filter(e => e.pinyin).length;
    expect(exact).toBe(total);
    expect(close).toBe(total);
  });
});

describe('Japanese: the katakana long mark, which is where this breaks silently', () => {
  const ja = (typed: string, want: string) => gradeTyped(typed, want, 'ja').verdict;

  /**
   * THE MEASURED TRAP. `wanakana.toKatakana` turns `ko-hi-` into コーヒー exactly, and
   * `koohii` into コオヒイ. Both are the word. 10.4% of JMdict readings are katakana, so
   * without the long-mark rule a learner is told they are wrong on roughly one Japanese card
   * in fifteen — and it reads as their mistake, not ours.
   */
  it('accepts every spelling a learner can actually produce for コーヒー', () => {
    expect(ja('コーヒー', 'コーヒー')).toBe('exact');   // ko-hi-
    expect(ja('コオヒイ', 'コーヒー')).toBe('exact');   // koohii
    expect(ja('こーひー', 'コーヒー')).toBe('exact');   // hiragana-bound
    expect(ja('こおひい', 'コーヒー')).toBe('exact');
  });

  it('accepts both spellings of パーティー', () => {
    expect(ja('パーティー', 'パーティー')).toBe('exact');  // pa-thi-
    expect(ja('パアティイ', 'パーティー')).toBe('exact');  // paathii
  });

  it('grades an ordinary hiragana word', () => {
    expect(ja('たべる', 'たべる')).toBe('exact');
    expect(ja('たべます', 'たべます')).toBe('exact');
    expect(ja('がっこう', 'がっこう')).toBe('exact');
  });

  it('forgives small kana and dakuten as a near miss', () => {
    expect(ja('きつて', 'きって')).toBe('close');
    expect(ja('がつこう', 'がっこう')).toBe('close');
    expect(ja('りよこう', 'りょこう')).toBe('close');
  });

  /**
   * A LONG VOWEL IS NOT A SLIP. おばさん is an aunt and おばあさん is a grandmother; collapsing
   * doubled vowels to forgive typing would accept one for the other, so the fold stops at the
   * long MARK and never touches a vowel the writer actually typed twice.
   */
  it('does not collapse a genuine long vowel', () => {
    expect(ja('おばさん', 'おばあさん')).toBe('wrong');
    expect(ja('おばあさん', 'おばあさん')).toBe('exact');
  });

  it('calls a different word wrong', () => {
    expect(ja('ねこ', 'いぬ')).toBe('wrong');
  });

  /** Every JLPT reading grades itself exact — including the 6.8% written in katakana. */
  it('holds over the whole JLPT vocabulary', () => {
    const readings = Object.values(jlpt).map(e => e.reading).filter(Boolean);
    const bad = readings.filter(r => gradeTyped(r, r, 'ja').verdict !== 'exact');
    expect(bad).toEqual([]);
    expect(readings.length).toBeGreaterThan(7000);
  });

  /**
   * Every katakana reading must also be reachable from its hiragana spelling, because that is
   * what a learner produces when their input is bound the other way.
   */
  it('reaches every katakana reading from hiragana', () => {
    const kata = Object.values(jlpt).map(e => e.reading)
      .filter(r => r && /[ァ-ヶ]/.test(r));
    const hira = (s: string) => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
    const bad = kata.filter(r => gradeTyped(hira(r), r, 'ja').verdict !== 'exact');
    expect(bad).toEqual([]);
    expect(kata.length).toBeGreaterThan(400);
  });
});

describe('the input is bound to the script the answer is written in', () => {
  /** Bound to hiragana, `ko-hi-` can never reach a katakana headword. See the module docstring. */
  it('reads the script off the expected answer', () => {
    expect(answerScript('コーヒー')).toBe('katakana');
    expect(answerScript('たべる')).toBe('hiragana');
    expect(answerScript('しんぶん')).toBe('hiragana');
  });

  it('agrees with the dictionary on real entries', () => {
    expect(answerScript(jlpt['新聞'].reading)).toBe('hiragana');
  });
});

describe('Spanish and French: accents forgive, ñ does not', () => {
  const es = (typed: string, want: string) => gradeTyped(typed, want, 'es').verdict;
  const fr = (typed: string, want: string) => gradeTyped(typed, want, 'fr').verdict;

  it('accepts the word itself, ignoring case', () => {
    expect(es('comer', 'comer')).toBe('exact');
    expect(es('COMER', 'comer')).toBe('exact');
    expect(es('  comer  ', 'comer')).toBe('exact');
  });

  it('treats a missing accent as a near miss', () => {
    expect(es('hablo', 'habló')).toBe('close');
    expect(es('estacion', 'estación')).toBe('close');
    expect(fr('etre', 'être')).toBe('close');
    expect(fr('eleve', 'élève')).toBe('close');
  });

  /**
   * `ñ` IS A LETTER. año/ano is the pair every Spanish learner is warned about, and grading
   * one as a near miss for the other would teach exactly the mistake the warning is about.
   */
  it('never folds ñ', () => {
    expect(es('ano', 'año')).toBe('wrong');
    expect(es('espanol', 'español')).toBe('wrong');
    expect(es('año', 'año')).toBe('exact');
  });

  /** `ç` carries no contrast in French — `facon` is not a word — so the cedilla is forgiven. */
  it('does fold ç, which distinguishes nothing', () => {
    expect(fr('garcon', 'garçon')).toBe('close');
    expect(fr('garçon', 'garçon')).toBe('exact');
  });

  it('calls a different word wrong', () => {
    expect(es('beber', 'comer')).toBe('wrong');
  });
});

describe('a polyphone’s other reading is not ignorance', () => {
  /**
   * 行 holds two cards. Typing háng on the xíng card is the OTHER card's correct answer, and
   * saying "wrong" there teaches a learner to distrust a distinction they have actually made.
   */
  it('names the reading they landed on', () => {
    expect(otherReading('háng', { h: '行', p: 'xíng' })).toBe('háng');
    expect(otherReading('hang2', { h: '行', p: 'xíng' })).toBe('háng');
  });

  it('says nothing when they typed this card’s own reading', () => {
    expect(otherReading('xíng', { h: '行', p: 'xíng' })).toBeNull();
  });

  it('says nothing for a character with one reading', () => {
    expect(otherReading('pengyou', { h: '朋友', p: 'péngyou' })).toBeNull();
  });
});
