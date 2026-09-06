import type { DeckWord, LanguageCode } from './types';
import { getLanguageConfig } from './languageConfig';
import { canonPinyin, stripTones } from './pinyin';
import { POLYPHONES } from './polyphones';

/**
 * Grading a TYPED answer, for all four languages.
 *
 * ── WHAT IS TYPED IS NOT THE SAME QUESTION IN EVERY LANGUAGE ──
 * Spanish and French have `hasReadings: false` — the `p` slot is empty by construction, so
 * there is nothing to type on the front of a normal card and the exercise has to be the
 * REVERSE one: meaning shown, type the word. Chinese and Japanese have the opposite problem:
 * you cannot type the characters without an IME offering you the answer, so theirs is the
 * FORWARD card — word shown, type its reading.
 *
 * Those are opposite orientations, and the flag that separates them already exists.
 * `typedOrientation` reads `hasReadings` rather than introducing a second one, which is the
 * rule this codebase states about every other cross-language difference.
 *
 * ── THE ORIENTATION IS PINNED, AND THAT PREVENTS A REAL FSRS CORRUPTION ──
 * Reverse + typed in Chinese would ask "what is the word for friend?" and demand one exact
 * romanisation. A learner answering with any other correct word for friend is marked wrong,
 * and FSRS records a lapse for a card they knew. The question has no single answer, so it must
 * not be asked. Forward + typed in Spanish is the mirror problem: the answer is already on
 * screen.
 *
 * ── THREE TIERS, AND THE MIDDLE ONE IS THE SAME IDEA IN THREE SCRIPTS ──
 * `exact` is right. `wrong` is wrong. `close` is "the skeleton is right and the layer written
 * on top of it is not" — the right syllables with the wrong tone, the right letters with the
 * wrong accent, the right kana written sloppily. It grades Good and shows the correct form,
 * because a learner who produced the syllable without its tone has recalled the word and
 * missed the tone, and calling that a total failure teaches them to fear the exercise.
 *
 * ── WHAT IS DELIBERATELY NOT FOLDED ──
 * `ü`, `ñ` and `ç` are LETTERS, not accents. Folding them merges 女 nü with 努 nu and, worse,
 * accepts `ano` for `año`. The same judgement `lib/phoneticSeries.ts` makes about ü, applied
 * in two more scripts.
 *
 * ── THIS FILE IS SYNCHRONOUS AND IMPORTS NO LIBRARY, ON PURPOSE ──
 * `wanakana` converts romaji to kana on the INPUT; by the time a value reaches here it is
 * already kana, and all that is left is a codepoint shift. Pulling wanakana in would make the
 * grader async, put 21 kB in front of every Spanish learner, and force every unit test to
 * mock a module. See lib/kana.ts.
 */

export type Verdict = 'exact' | 'close' | 'wrong';

export interface TypedResult {
  verdict: Verdict;
  /** The form that was wanted — shown whenever it was not what they typed. */
  expected: string;
}

/** `forward` = the word is shown and its reading typed; `reverse` = the opposite. */
export type Orientation = 'forward' | 'reverse';

export function typedOrientation(lang: LanguageCode): Orientation {
  return getLanguageConfig(lang).hasReadings ? 'forward' : 'reverse';
}

/** What the learner must produce for this card: its reading (zh/ja) or the word (es/fr). */
export function expectedAnswer(card: Pick<DeckWord, 'h' | 'p'>, lang: LanguageCode): string {
  return (typedOrientation(lang) === 'forward' ? card.p : card.h) ?? '';
}

/**
 * Whether this card can be typed at all.
 *
 * A Chinese card imported without pinyin has no answer to grade against, and grading an
 * absent answer as a failure is the same mistake as rendering a loading state as an answer:
 * the value means "not stored", not "you got it wrong". Such a card falls back to
 * reveal-and-self-grade instead.
 */
export function canType(card: Pick<DeckWord, 'h' | 'p'>, lang: LanguageCode): boolean {
  return expectedAnswer(card, lang).trim().length > 0;
}

/* ─────────────────────────── Japanese ─────────────────────────── */

/**
 * Katakana → hiragana as a pure codepoint shift, NOT via `wanakana.toHiragana`.
 *
 * They disagree, and that disagreement is the bug this file was written around: wanakana
 * expands the long mark while converting, so コーヒー comes out as こうひい, while a learner
 * typing `ko-hi-` produces こーひー. A codepoint shift leaves ー alone, so both sides can then
 * be lengthened by ONE rule (`expandLong`) instead of two that disagree.
 */
function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶヽヾ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const VOWEL_OF = new Map<string, string>();
for (const [vowel, row] of [
  ['あ', 'ぁあかがさざただなはばぱまゃやらわゎ'],
  ['い', 'ぃいきぎしじちぢにひびぴみり'],
  ['う', 'ぅうくぐすずつづぬふぶぷむゅゆるゔ'],
  ['え', 'ぇえけげせぜてでねへべぺめれ'],
  ['お', 'ぉおこごそぞとどのほぼぽもょよろを'],
] as const) for (const kana of row) VOWEL_OF.set(kana, vowel);

/**
 * Resolve `ー` to the vowel it lengthens, so a loanword's stored katakana and the kana a
 * learner types compare equal.
 *
 * MEASURED: 10.4% of JMdict readings and 6.8% of JLPT vocabulary are katakana, which is where
 * every long mark lives. Without this a learner who typed the right word is told they are
 * wrong roughly once every fifteen Japanese cards, and the failure looks like their mistake
 * rather than ours. After ん, or at the start of a string, there is no vowel to copy and the
 * mark is left as itself rather than guessed at.
 */
function expandLong(s: string): string {
  let out = '';
  for (const ch of s) {
    if (ch === 'ー') {
      const vowel = VOWEL_OF.get(out[out.length - 1] ?? '');
      out += vowel ?? ch;
    } else out += ch;
  }
  return out;
}

/** Small kana → their full-size counterparts. Used by the `close` tier only. */
const SMALL_KANA: Record<string, string> = {
  'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
  'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
};

/* ─────────────────────── per-language rules ─────────────────────── */

interface Normalizer {
  /** Right answer, spelled right. */
  exact: (s: string) => string;
  /** Right answer, spelled sloppily — tones, accents, or small kana and dakuten. */
  close: (s: string) => string;
}

const PINYIN: Normalizer = {
  exact: s => canonPinyin(s),
  // Right syllables, wrong tone — the commonest Chinese slip by a wide margin, and worth
  // naming rather than failing, because the tone is a separate thing to learn from the word.
  close: s => stripTones(canonPinyin(s)),
};

const KANA: Normalizer = {
  exact: s => expandLong(kataToHira(s.trim())),
  close: s => expandLong(kataToHira(s.trim()))
    // Dakuten and handakuten decompose under NFD into their own combining marks.
    .normalize('NFD').replace(/[\u3099\u309a]/g, '').normalize('NFC')
    .replace(/[ぁぃぅぇぉっゃゅょゎ]/g, c => SMALL_KANA[c])
    // おう/おお and えい/ええ are one sound written two ways, so choosing the other spelling
    // means the word was heard correctly. Doubled vowels are NOT collapsed any further:
    // おばさん and おばあさん are different words, not a typing slip.
    .replace(/おう/g, 'おお').replace(/えい/g, 'ええ'),
};

/**
 * `ñ` is PARKED, `ç` is NOT, and the difference is not fussiness.
 *
 * `ñ` is a LETTER of the Spanish alphabet with its own place in the dictionary, and `año`
 * and `ano` are two different words — one of them notoriously. Folding it would grade the
 * wrong one as a near miss. `ç` is an ordinary `c` wearing a cedilla: no French pair is
 * distinguished by it (`facon` is not a word), so `garcon` for `garçon` is exactly the kind
 * of keyboard slip this tier exists to forgive. The test is whether the mark carries a
 * contrast, not how it is drawn — the same question asked of `ü` in pinyin.
 */
const LATIN: Normalizer = {
  exact: s => s.trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFC'),
  close: s => {
    // A sentinel written as an ESCAPE, not as a literal control character: a raw U+0001 in a
    // source file is invisible in every editor and survives a copy-paste only by luck.
    const PARK_N = '\u0001';
    let out = s.trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFC');
    out = out.replaceAll('ñ', PARK_N);
    out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return out.replaceAll(PARK_N, 'ñ');
  },
};

const NORMALIZE: Record<LanguageCode, Normalizer> = { zh: PINYIN, ja: KANA, es: LATIN, fr: LATIN };

/**
 * Grade one typed answer. Pure — same inputs, same verdict, no clock and no storage.
 *
 * An empty answer is `wrong` rather than ungraded: the learner submitted nothing, which is how
 * this screen spells "I don't know". An empty EXPECTED is also `wrong`, but `canType` is what
 * stops such a card being offered for typing in the first place.
 */
export function gradeTyped(typed: string, expected: string, lang: LanguageCode): TypedResult {
  const want = (expected ?? '').trim();
  const got = (typed ?? '').trim();
  const result = (verdict: Verdict): TypedResult => ({ verdict, expected: want });
  if (!got || !want) return result('wrong');
  const n = NORMALIZE[lang];
  if (n.exact(got) === n.exact(want)) return result('exact');
  if (n.close(got) === n.close(want)) return result('close');
  return result('wrong');
}

/**
 * Which script the answer is written in, so the input can be put in the matching IME mode.
 *
 * MEASURED, and it is what makes Japanese loanwords gradeable at all. Bound to hiragana,
 * `ko-hi-` gives こーひー and `pa-thi-` gives ぱーてぃー, neither of which is a stored form.
 * Bound to KATAKANA the same keystrokes give コーヒー and パーティー exactly. The app knows the
 * answer's script from the card, so it can spare the learner a conversion it is better placed
 * to make than they are.
 */
export function answerScript(expected: string): 'katakana' | 'hiragana' {
  return /[ァ-ヺ]/.test(expected) ? 'katakana' : 'hiragana';
}

/**
 * Chinese only: did they type a DIFFERENT valid reading of this same character?
 *
 * A polyphone holds one card per reading — 行 is both xíng and háng. Typing the other card's
 * reading is not ignorance of the character, it is a correct answer to a different question,
 * and calling it simply wrong teaches a learner to distrust a distinction they have in fact
 * learned. Returns the reading they landed on, or null.
 */
export function otherReading(typed: string, card: Pick<DeckWord, 'h' | 'p'>): string | null {
  const readings = POLYPHONES[card.h];
  if (!readings) return null;
  const got = canonPinyin(typed);
  const hit = readings.find(r => canonPinyin(r.p) === got);
  return hit && canonPinyin(hit.p) !== canonPinyin(card.p ?? '') ? hit.p : null;
}
