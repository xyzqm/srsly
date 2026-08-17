import cedictData from '@dict/cedict.json';
import { HSK_VOCAB } from '@/lib/data/hsk-vocab';

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

/**
 * ── A DICTIONARY MATCH MUST NOT HIDE A DECK WORD ─────────────────────────────────────────
 *
 * The two helpers below are one rule in two shapes, and they are what makes this segmenter
 * usable for cross-referencing rather than merely correct on average. CC-CEDICT holds 121k
 * entries including phrases, place names and compounds, so a plain longest match regularly
 * eats a word the learner actually has a card for — and it fails SILENTLY: no blank appears,
 * and nothing says why.
 *
 * Both helpers only ever shorten a DICTIONARY match. A match on the deck's own card is
 * authoritative and is never taken apart.
 *
 * The minimum piece length of two characters is what stops this from running wild. Inside a
 * two-character word the halves are morphemes, not words, so a learner holding 生 and 活 as
 * separate cards must not have 生活 torn in two, and 中国人 must not shed a bare 人.
 */

/**
 * Case 1 — the deck words sit exactly INSIDE the match: 经济发展 is a CC-CEDICT phrase, and a
 * learner with both 经济 and 发展 due got nothing from a sentence containing both.
 */
function tileByDeckWords(word: string, overrides: Map<string, DictOverride>): string[] | null {
  if (word.length < 4) return null;   // two pieces of two characters is the smallest tiling
  const walk = (rest: string, acc: string[]): string[] | null => {
    if (!rest) return acc.length >= 2 ? acc : null;
    for (let len = Math.min(MAX_OVERRIDE_LEN, rest.length); len >= 2; len--) {
      const head = rest.slice(0, len);
      if (!overrides.has(head)) continue;
      const done = walk(rest.slice(len), [...acc, head]);
      if (done) return done;
    }
    return null;
  };
  return walk(word, []);
}

/**
 * Case 2 — the deck word STRADDLES the match's right edge, so tiling can't see it. 中国城市 is
 * 中国 + 城市, but CC-CEDICT has 中国城 ("Chinatown"), which is longer, wins, and leaves 市
 * stranded — with 城市 (HSK 1, in almost every Chinese deck) nowhere in the output.
 *
 * Returns how far to shorten the match, or null to keep it whole. The prefix that is left
 * behind must itself be a real word: shortening is only worth doing if what remains is
 * something a reader would recognise, not an arbitrary cut.
 */
function shortenForDeckWord(
  text: string, i: number, len: number, runEnd: number, overrides: Map<string, DictOverride>,
): number | null {
  for (let k = 1; k < len; k++) {
    for (let dl = Math.min(MAX_OVERRIDE_LEN, runEnd - (i + k)); dl >= 2; dl--) {
      if (k + dl <= len) break;   // fits inside the match — that is tileByDeckWords' case
      if (!overrides.has(text.slice(i + k, i + k + dl))) continue;
      const prefix = text.slice(i, i + k);
      return isWord(prefix) || overrides.has(prefix) ? k : null;
    }
  }
  return null;
}

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

    while (i < runEnd) {
      const room = runEnd - i;
      let matched = false;
      for (let len = Math.min(MAX_OVERRIDE_LEN, room); len >= 1; len--) {
        let cand = text.slice(i, i + len);
        if (!overrides.has(cand) && !(len <= MAX_DICT_LEN && isWord(cand))) continue;
        matched = true;
        // A match on the deck's own card is authoritative and is never re-cut. Only a
        // dictionary match gives way to the words the learner actually holds.
        if (overrides.has(cand)) {
          out.push(emit(cand, overrides));
          i += cand.length;
          break;
        }
        const cut = shortenForDeckWord(text, i, len, runEnd, overrides);
        if (cut !== null) cand = text.slice(i, i + cut);
        for (const piece of tileByDeckWords(cand, overrides) ?? [cand]) {
          out.push(emit(piece, overrides));
          i += piece.length;
        }
        break;
      }
      // Nothing matched at all — a single hanzi CC-CEDICT has never heard of. Still a word,
      // not punctuation.
      if (!matched) { out.push(emit(text[i], overrides)); i += 1; }
    }
  }

  return out;
}
