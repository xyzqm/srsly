import type { DeckWord, LanguageCode } from './types';
import { canonPinyin, stripTones } from './pinyin';

/**
 * Grading a TYPED answer, for all four languages.
 *
 * ── ONE QUESTION IN EVERY LANGUAGE: MEANING IN, WORD OUT ──
 * The card shows the English meaning and the learner types the word — `comer`, `parler`,
 * 朋友, 食べる. Chinese and Japanese are typed with the learner's own OS IME, which means the
 * answer is the CHARACTERS, not a romanisation of them.
 *
 * ── THIS REPLACES AN EARLIER SPLIT, AND THE REASONING IS WORTH KEEPING ──
 * It used to face zh/ja the other way — character shown, reading typed — on the argument that
 * an IME hands you the character once you have the sound, so typing 朋友 tests less than it
 * appears to. That argument is still TRUE and was measured: a multi-character HSK word has a
 * median of ONE homophone in the whole of CC-CEDICT, so pinyin→characters is near
 * deterministic. What it got wrong is that it is not the only thing worth testing. Producing
 * the word from its meaning and picking the right characters is what writing Chinese on a
 * keyboard actually is, and a learner who wants to practise that is asking for a real skill.
 * The synonym risk that made the old design nervous is handled by the four grade buttons,
 * which are always on screen — a learner who is marked wrong for a valid synonym presses Good.
 *
 * ── THE `close` TIER IS NOW THE FORGOTTEN-KEYBOARD TIER ──
 * Type `pengyou` with the IME switched off, or leave たべる unconverted, and you have shown you
 * know the word and failed only to produce the script. That grades Good and shows the correct
 * form rather than recording a lapse — the same "right skeleton, wrong layer written on top"
 * the accent tier expresses for Spanish and French.
 *
 * ── WHAT IS DELIBERATELY NOT FOLDED ──
 * `ü` and `ñ` are LETTERS, not accents: folding them merges 女 nü with 努 nu and accepts `ano`
 * for `año`. `ç` IS folded, because no French pair turns on a cedilla. The test is whether the
 * mark distinguishes two words, not how it is drawn.
 *
 * ── NO LIBRARY, AND NOTHING TOUCHES THE INPUT ──
 * `wanakana` used to convert romaji to kana as the learner typed. It had to go: it transforms
 * the same keystrokes an OS IME is transforming, so with a real Japanese keyboard the two
 * fight over every character. The app now keeps its hands off the field entirely, and this
 * module stays synchronous — every comparison here is a codepoint operation.
 */

export type Verdict = 'exact' | 'close' | 'wrong';

export interface TypedResult {
  verdict: Verdict;
  /** The form that was wanted — shown whenever it was not what they typed. */
  expected: string;
}

/**
 * What the learner must produce: the word itself, in every language.
 *
 * There is no orientation to choose any more. The old `typedOrientation` read `hasReadings`
 * to face zh/ja forward and es/fr reverse; now all four are meaning-first, so the flag has no
 * job here and asking it would only invite the split back.
 */
export function expectedAnswer(card: Pick<DeckWord, 'h'>): string {
  return card.h ?? '';
}

/**
 * The reading, if this card has one — the answer to the `close` tier.
 *
 * Empty for Spanish and French, where the reading IS the spelling and there is nothing
 * separate to half-credit.
 */
export function answerReading(card: Pick<DeckWord, 'p'>): string {
  return card.p ?? '';
}

/**
 * Whether this card can be typed at all. A word always has its own text, so this is only ever
 * false for a malformed card — but grading an absent answer would mark the learner wrong for
 * a hole in OUR data, which is the failure mode CLAUDE.md documents at length.
 */
export function canType(card: Pick<DeckWord, 'h'>): boolean {
  return expectedAnswer(card).trim().length > 0;
}

/* ─────────────────────────── kana folding ─────────────────────────── */

/**
 * Katakana → hiragana as a pure codepoint shift.
 *
 * Kept from the previous design because the reason still holds: it is the only way to compare
 * コーヒー with こーひー without a library that disagrees with itself about the long mark.
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

/** Resolve `ー` to the vowel it lengthens, so コーヒー and こおひい compare equal. */
function expandLong(s: string): string {
  let out = '';
  for (const ch of s) {
    if (ch === 'ー') out += VOWEL_OF.get(out[out.length - 1] ?? '') ?? ch;
    else out += ch;
  }
  return out;
}

/** One canonical spelling of a kana string, for comparing a reading against what was typed. */
function foldKana(s: string): string {
  return expandLong(kataToHira(s.trim().normalize('NFKC')));
}

/* ─────────────────────── per-language rules ─────────────────────── */

/**
 * The word itself, compared exactly — but normalised for the shapes an IME can emit.
 *
 * NFKC collapses the full-width Latin and digits a CJK input method produces when it is in
 * the wrong mode, so `ａ` and `a` are the same answer. Nothing else is folded: a different
 * character is a different word, and there is no near-miss to be generous about.
 */
const cjkExact = (s: string) => s.trim().normalize('NFKC').replace(/\s+/g, '');

/** `ñ` is parked; `ç` is not. See the module docstring. */
function latinClose(s: string): string {
  // A sentinel written as an escape, not a literal control character.
  const PARK_N = '\u0001';
  let out = s.trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFC');
  out = out.replaceAll('ñ', PARK_N);
  out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return out.replaceAll(PARK_N, 'ñ');
}

const latinExact = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFC');

/**
 * Did they type the READING instead of the word?
 *
 * Chinese: an IME is driven with toneless pinyin, so that is what a learner types when they
 * forget to switch it on — the comparison drops tones on both sides deliberately.
 * Japanese: the realistic miss is not romaji but UNCONVERTED KANA. You type `taberu`, the IME
 * gives たべる, and you submit without pressing space to reach 食べる. That is the case worth
 * catching, and it needs no romaji table at all.
 */
function typedTheReading(typed: string, reading: string, lang: LanguageCode): boolean {
  if (!reading.trim()) return false;
  if (lang === 'zh') {
    const t = stripTones(canonPinyin(typed));
    return t.length > 0 && t === stripTones(canonPinyin(reading));
  }
  if (lang === 'ja') {
    const t = foldKana(typed);
    return t.length > 0 && t === foldKana(reading);
  }
  return false;
}

/**
 * Grade one typed answer. Pure — same inputs, same verdict, no clock and no storage.
 *
 * `reading` is optional and only ever produces a `close`; passing nothing simply means the
 * forgotten-keyboard tier is unavailable, never that a right answer is marked wrong.
 */
export function gradeTyped(
  typed: string,
  expected: string,
  lang: LanguageCode,
  reading = '',
): TypedResult {
  const want = (expected ?? '').trim();
  const got = (typed ?? '').trim();
  const result = (verdict: Verdict): TypedResult => ({ verdict, expected: want });
  if (!got || !want) return result('wrong');

  if (lang === 'zh' || lang === 'ja') {
    if (cjkExact(got) === cjkExact(want)) return result('exact');
    if (typedTheReading(got, reading, lang)) return result('close');
    return result('wrong');
  }

  if (latinExact(got) === latinExact(want)) return result('exact');
  if (latinClose(got) === latinClose(want)) return result('close');
  return result('wrong');
}
