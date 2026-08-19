import { wordsContaining } from './data/dict';
import { loadLevelTable, loadVocabTable } from './curriculum';
import { POLYPHONES } from './polyphones';

/**
 * Characters that are not words on their own — 黏着语素, bound forms.
 *
 * 璃 is the second half of 玻璃 and appears essentially nowhere else; CC-CEDICT glosses it
 * "(phonetic character used in transliteration of foreign names)", which is true and useless
 * as a study card. A passage cannot use it, a blank cannot test it, and the generator asked
 * to write a sentence around it will either refuse or invent something wrong.
 *
 * This is the same problem the `compounds` field already solved for polyphone readings like
 * 行 háng, which also never stands alone. It was only ever offered for polyphones because
 * that is the case it was built for — but the mechanism is about STANDING ALONE, not about
 * having two readings, and a bound character needs it just as much.
 *
 * CC-CEDICT marks these itself, in two ways. 649 single characters name their compound
 * outright ("used in 葡萄[pu2 tao5]", "see 玻璃[bo1 li5]"); another 329 are flagged bound
 * without naming one ("(bound form) spider"). For the second group the compound is found by
 * searching the dictionary, which resolves all but 30 — and those thirty are obscure variant
 * glyphs nobody is adding to a deck.
 */

/** Bound, and the compound is right there in the gloss. */
const NAMES_ITS_COMPOUND = [
  /^used in ([^[]+)\[/,
  /^see ([^[]+)\[/,
  /^see ([一-鿿]{2,})[,;]/,
];

/** Bound, but the gloss doesn't say what it is bound INTO. */
const BOUND_MARKER = /\(bound form\)|phonetic character used in transliteration|used in loanwords for its phonetic value/;

/**
 * A gloss that offers NO standalone meaning — every word of it points somewhere else.
 *
 * "used in 咖喱[ga1 li2]" and "(phonetic character used in transliteration of foreign names)"
 * tell you the character exists and nothing you could put on a card. Distinct from
 * "(bound form) butterfly", which does give a meaning and merely says it usually travels
 * with company.
 */
const POINTER_ONLY = [
  /^used in [^[]+\[/,
  /^see [^[]+[[,;]/,
  /phonetic character used in transliteration/,
  /used in loanwords for its phonetic value/,
];

const HAN = /^[一-鿿]+$/;

/**
 * The markers sit at the START of a sense, not of the whole gloss ("(bound form) China;
 * Chinese"), so every sense is tested on its own rather than only the first.
 */
function senses(gloss: string): string[] {
  return gloss.split(/\s*;\s*/).map(x => x.trim()).filter(Boolean);
}

/**
 * The compound a gloss names, if it names one and it is usable.
 *
 * Two rejections matter. A cross-reference to a DIFFERENT character ("夊: see 夂[zhi3]") is a
 * pointer between glyphs, not a compound — it fails the "must contain our character" test.
 * And a traditional|simplified pair ("used in 䰾魚|鲃鱼[...]") is split on the bar, keeping
 * the simplified half, which is the script the rest of the app is in.
 */
function compoundFromGloss(char: string, gloss: string): string | null {
  for (const sense of senses(gloss)) {
    for (const re of NAMES_ITS_COMPOUND) {
      const m = re.exec(sense);
      if (!m) continue;
      const candidate = m[1].split('|').pop()!.trim();
      if (candidate.length >= 2 && candidate.includes(char) && HAN.test(candidate)) return candidate;
    }
  }
  return null;
}

/** Whether this character's dictionary gloss says it cannot stand alone. */
export function isBoundForm(char: string, gloss: string): boolean {
  if (char.length !== 1 || !HAN.test(char)) return false;
  return compoundFromGloss(char, gloss) !== null || senses(gloss).some(x => BOUND_MARKER.test(x));
}

/**
 * Whether saving this character ALONE should be refused.
 *
 * Three conditions, and the last two exist because the first one is not safe by itself.
 * cedict.json holds one merged entry per surface, and for a character with a rare second
 * reading that entry is sometimes the rare one's: 上 is glossed "used in 上聲|上声", 个 is
 * "used in 自個兒|自个儿", 家 is "used in 傢伙|家伙". On the gloss alone, blocking would have
 * refused 上, 个, 家, 提, 无, 血, 转, 节, 万 — nine ordinary words, several of them HSK 1.
 *
 *   1. The gloss points elsewhere and offers no meaning of its own.
 *   2. The character is not a single-character word in the curriculum. A curated level list
 *      saying 上 IS a word settles it; that is what the merged dictionary entry lost.
 *   3. It is not a known polyphone. 行 háng is glossed "(bound form) row; line" and is
 *      genuinely bound in that sense, but the character stands alone elsewhere — as the
 *      classifier in 一行 — and a reading picker already handles it.
 *
 * 744 characters remain, and none of them is an HSK word or a polyphone.
 *
 * `(bound form)` is deliberately NOT enough to block. 蝶 "butterfly" carries a real meaning,
 * and refusing to store it would be this rule overreaching into a judgement call. It still
 * gets a suggested compound; it just is not forced to take one.
 */
export async function isStrictlyBound(char: string, gloss: string): Promise<boolean> {
  if (char.length !== 1 || !HAN.test(char)) return false;
  if (POLYPHONES[char]) return false;
  if (!POINTER_ONLY.some(re => re.test(gloss.trim()))) return false;
  const vocab = await loadVocabTable('zh');
  return !vocab?.[char];
}

/**
 * Compounds to offer for a bound character, best first.
 *
 * Ranked by CURRICULUM LEVEL before anything else, because the point is to give the
 * generator a word it can build a sentence around at the learner's level. 咖's gloss names
 * 咖喱 (curry), but 咖啡 is HSK 1 and 咖喱 is not in the list at all — a beginner meeting 咖
 * should meet it in coffee. The gloss's own answer is the next tiebreak, then shorter words,
 * so an unranked character still lands on 蜘 → 蜘蛛 rather than 蜘蛛人.
 */
export async function suggestCompounds(char: string, gloss: string, limit = 3): Promise<string[]> {
  const named = compoundFromGloss(char, gloss);
  const [found, levels] = await Promise.all([
    wordsContaining(char),
    loadLevelTable('zh'),
  ]);

  const rank = new Map<string, number>();
  if (levels) {
    for (const [level, words] of Object.entries(levels)) {
      for (const w of words) if (!rank.has(w)) rank.set(w, Number(level));
    }
  }

  const candidates = new Set(found);
  if (named) candidates.add(named);

  return [...candidates].sort((a, b) =>
    (rank.get(a) ?? 99) - (rank.get(b) ?? 99) ||
    (a === named ? 0 : 1) - (b === named ? 0 : 1) ||
    a.length - b.length ||
    a.localeCompare(b),
  ).slice(0, limit);
}
