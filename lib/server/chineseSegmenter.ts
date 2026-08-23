import cedictData from '@dict/cedict.json';
import { HSK_VOCAB } from '@/lib/data/hsk-vocab';
import { HSK_LEVELS } from '@/lib/data/hsk-levels';

/**
 * Server-only Chinese segmenter — the one language that had none.
 *
 * The daily-content path never needed it: the model self-segments with `|` (see
 * `segmentation: 'pipe'` in lib/languageConfig.ts), so route.ts only ever had to split a
 * string the model had already marked up. Pasted text carries no such marks, and asking the
 * model to add them would spend an AI generation on prose the user already has — the exact
 * cost the paste flow exists to avoid. So this resolves the split from the dictionary
 * instead, and pasting stays free and instant.
 *
 * FORWARD MAXIMUM MATCHING. At each position take the LONGEST run of Han characters that is
 * a known word, then continue from its end. It is the standard dictionary segmenter for
 * Chinese and it is wrong in a known, bounded way: a longer word that starts one character
 * early wins over the correct pair (研究生命 → 研究生 + 命, not 研究 + 生命). Fixing that
 * needs word frequencies or a statistical model, and buys little here — a mis-split token
 * simply fails to match a deck word, so the cost is a blank that doesn't appear, never a
 * wrong blank. Chinese already accepts the same trade-off in the client's re-segmentation
 * pass (hooks/useDailyContent.ts).
 */

export type RawTok = [string] | [string, string] | [string, string, string] | [string, string, string, string];

interface DictOverride { p: string; m: string; }

const cedict = cedictData as unknown as Record<string, { p: string; m: string }>;

const HAN = /[一-鿿㐀-䶿]/;

/**
 * Longest DICTIONARY entry a greedy match will take. Four covers every compound and every
 * 成语; CC-CEDICT's longer entries are overwhelmingly proper names, book titles and set
 * phrases, and letting the match reach them is how a whole clause collapses into one token.
 */
const MAX_DICT_LEN = 4;
/** Deck words and names may run longer — those are supplied by the caller, not guessed. */
const MAX_OVERRIDE_LEN = 8;

/** Is this a word at all? Used to find boundaries, never to gloss — see the emit below. */
function isWord(word: string): boolean {
  return word in cedict || word in HSK_VOCAB;
}

/* ── How likely is this actually the word the writer meant? ──────────────────────────────
 *
 * Longest-match alone is wrong, and wrong in two directions that a dictionary of 121k entries
 * makes routine:
 *
 *   我家的小猫  →  我 + 家的 + 小猫     家的 is CC-CEDICT's "(old) wife"; the sentence means
 *                                        "my home's cat" and wants 家 + 的.
 *   中国人民    →  中国人 + 民          "Chinese person" + a stranded bare 民, where 中国 +
 *                                        人民 is two ordinary words.
 *
 * Both are the same failure: a longer entry that exists outranks a shorter pair that is far
 * commoner. So each candidate word gets a score standing in for log P(word), and the run is
 * segmented to maximise the total. Because every score is NEGATIVE, adding a word costs
 * something — which is what keeps 小猫 together rather than splitting it into two very common
 * single characters, while still letting 家 + 的 beat an archaic 家的.
 *
 * The frequency signal is HSK LEVEL, which is the only graded one this repo has and is a real
 * one: HSK 1 is the vocabulary a first-week learner meets. Everything outside HSK falls back
 * to a flat "in the dictionary" score, and CC-CEDICT's own register tags demote the entries
 * that cause the problem.
 */

/** word → HSK band (1 easiest). Built once; hsk-levels.json is keyed the other way round. */
const HSK_LEVEL: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (const [level, words] of Object.entries(HSK_LEVELS)) {
    const n = Number(level);
    for (const w of words as string[]) if (!m.has(w)) m.set(w, n);
  }
  return m;
})();

/**
 * Entries CC-CEDICT itself marks as not-current usage.
 *
 * Deliberately NOT `(coll.)`, `(slang)` or `(dialect)`: those are things people actually say,
 * and a learner meeting them still wants the gloss. This is only about which reading wins a
 * boundary contest — an archaic sense should never outrank two everyday words.
 */
const NOT_CURRENT = /\((old|archaic|literary|obsolete|classical)\b|\bold variant of\b/i;

/** Natural log of a rough unigram probability. Negative; larger (nearer 0) is likelier. */
function wordScore(word: string, overrides: Map<string, DictOverride>): number {
  /**
   * A deck word is not a guess — the caller supplied it, so it must win any contest it enters.
   *
   * BUT ONLY FROM TWO CHARACTERS UP. Inside a two-character word the halves are morphemes,
   * not words: a learner holding 生 and 活 as separate cards must not have 生活 torn in two,
   * and 中国人 must not shed a bare 人. A single-character override therefore gets no bonus at
   * all and competes on frequency like any other candidate — which is enough to keep 生活 and
   * 中国人 whole, because one ordinary word outscores two very common characters.
   */
  if (word.length >= 2 && overrides.has(word)) return 100;

  const level = HSK_LEVEL.get(word);
  if (level !== undefined) return Math.log(1e-3 / level);   // HSK 1 likeliest, HSK 6 least
  if (word in HSK_VOCAB) return Math.log(1e-3 / 6);         // in HSK, band unknown

  const gloss = cedict[word]?.m;
  if (gloss !== undefined) return Math.log(NOT_CURRENT.test(gloss) ? 1e-9 : 1e-5);

  return Math.log(1e-7);   // a hanzi the dictionary has never heard of
}

/**
 * Best segmentation of one run of Han characters, by total score.
 *
 * A plain left-to-right DP: `best[k]` is the best score for the first k characters, and every
 * candidate word ending at k extends some earlier prefix. O(n · maxLen), which for a run of
 * prose is nothing.
 */
function segmentRun(run: string, overrides: Map<string, DictOverride>): string[] {
  const n = run.length;
  const best = new Array<number>(n + 1).fill(-Infinity);
  const from = new Array<number>(n + 1).fill(0);
  best[0] = 0;

  for (let k = 1; k <= n; k++) {
    for (let len = Math.min(MAX_OVERRIDE_LEN, k); len >= 1; len--) {
      const start = k - len;
      if (best[start] === -Infinity) continue;
      const cand = run.slice(start, k);
      // Single characters are always allowed, so the DP can never dead-end on a hanzi the
      // dictionary does not know.
      const usable = len === 1 || overrides.has(cand) || (len <= MAX_DICT_LEN && isWord(cand));
      if (!usable) continue;
      const score = best[start] + wordScore(cand, overrides);
      if (score > best[k]) { best[k] = score; from[k] = start; }
    }
  }

  const out: string[] = [];
  for (let k = n; k > 0; k = from[k]) out.unshift(run.slice(from[k], k));
  return out;
}

/**
 * ── A DICTIONARY MATCH MUST NOT HIDE A DECK WORD ─────────────────────────────────────────
 *
 * CC-CEDICT holds 121k entries including phrases, place names and compounds, so a plain
 * longest match regularly eats a word the learner actually has a card for — and it fails
 * SILENTLY: no blank appears, and nothing says why. 经济发展 is a CC-CEDICT phrase, and a
 * learner with both 经济 and 发展 due got nothing from a sentence containing both.
 *
 * This used to need two helpers that re-cut a greedy match after the fact, plus a minimum
 * piece length of two characters to stop the re-cutting running wild (so a learner holding 生
 * and 活 separately did not have 生活 torn in half).
 *
 * `wordScore` subsumes the re-cutting: a deck word of two characters or more scores so far
 * above any dictionary entry that the DP never chooses a segmentation burying one, and it
 * weighs the whole run rather than patching up one greedy decision.
 *
 * THE TWO-CHARACTER MINIMUM SURVIVES, as a rule about which overrides get that bonus. Dropping
 * it re-broke exactly what it was written for: with 生 and 活 both in the deck, two overrides
 * outscored one dictionary word and 生活 came apart.
 */

/**
 * One token on the wire.
 *
 * A deck word carries its card's own pinyin and gloss — that is what preserves the intended
 * reading of a polyphone. EVERYTHING ELSE GOES OUT BARE, exactly as the model's pipe format
 * does, and the client resolves it through lib/data/dict.ts. That is not laziness: the client
 * consults its curated COMMON table and HSK_VOCAB before falling back to raw CC-CEDICT, and
 * glossing here would override that with the worse answer (CC-CEDICT's first sense for 现代
 * is "Hyundai, South Korean company"). Pasted text should read exactly like a generated one.
 */
function emit(word: string, overrides: Map<string, DictOverride>): RawTok {
  const hit = overrides.get(word);
  return hit ? [word, hit.p, hit.m] : [word];
}

/** A run of Latin letters/digits — a number, a unit, an embedded English word or a URL. */
const LATIN_RUN = /^[0-9A-Za-z][0-9A-Za-z.'’\-–:/%]*[0-9A-Za-z%]|^[0-9A-Za-z]/;

/**
 * Segment plain Chinese text into the RawTok wire format the client consumes.
 * `overrides` carries the deck's own words and always wins at equal length — same contract
 * as segmentJa / segmentEs / segmentFr.
 */
export function segmentZh(text: string, overrides: Map<string, DictOverride>): RawTok[] {
  if (!text) return [];
  const out: RawTok[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }   // whitespace separates, but is never a token

    if (!HAN.test(ch)) {
      const latin = LATIN_RUN.exec(text.slice(i))?.[0];
      if (latin) { out.push([latin]); i += latin.length; continue; }
      out.push([ch]);                        // every other mark is its own token
      i++;
      continue;
    }

    // How far the current run of Han characters reaches — a match may never cross out of it.
    let runEnd = i;
    while (runEnd < text.length && HAN.test(text[runEnd])) runEnd++;

    // The whole run at once, scored — see segmentRun. Deck words score so far above anything
    // else that a segmentation containing them always wins, which is what the two helpers
    // above used to arrange by re-cutting a greedy match after the fact.
    for (const piece of segmentRun(text.slice(i, runEnd), overrides)) {
      out.push(emit(piece, overrides));
    }
    i = runEnd;
  }

  return out;
}
