import { wordsContaining } from './data/dict';
import { loadLevelTable } from './curriculum';

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
