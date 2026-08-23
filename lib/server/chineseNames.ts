import cedictData from '@dict/cedict.json';
import { HSK_LEVELS } from '@/lib/data/hsk-levels';

/**
 * Guess the personal names in a piece of Chinese text.
 *
 * WHY THIS ONLY EVER SUGGESTS. A generated passage gets its names from the model, which lists
 * them in a side-channel; pasted text has no such channel and no model call, so a name is
 * indistinguishable from two ordinary characters — 李华 segments to 李 "surname Li" and 华
 * "abbr. for China", which is nonsense in the middle of a story.
 *
 * A dictionary cannot settle this on its own. CC-CEDICT glosses 755 single characters as
 * "surname …", and they include 和, 也, 于, 干, 任 and 从 — some of the commonest words in the
 * language. Worse, cedict's primary sense for 和 IS "surname He". Applying a surname rule
 * silently would merge 和我 into a fake name and corrupt the reading, which is a good deal
 * worse than two characters with honest glosses.
 *
 * So the output is a SUGGESTION the reader confirms, never an edit. Being wrong is then
 * visible and one click from corrected, instead of a word that quietly does not exist.
 *
 * The guards, in order of how much work they do:
 *   - a curated surname list, with the everyday-word surnames (白 黄 高 江 石 毛 龙 万 文 方
 *     金 田 林 于 和 任 从) left out entirely;
 *   - the dictionary must have nothing better to say at that position, so 王子 "prince" and
 *     高兴 "happy" are never touched;
 *   - the given name may not be a function word or a common verb, which is what stopped
 *     李华说 "Li Hua says" being read as a three-character name;
 *   - a two-character given name is only accepted when that exact span RECURS. A person is
 *     mentioned more than once; a verb that happens to follow one is not.
 */

const cedict = cedictData as unknown as Record<string, { p: string; m: string }>;
const isWord = (w: string) => w in cedict;

const SURNAMES = new Set([...'李王张刘陈杨赵吴周徐孙朱胡郭何罗郑梁谢唐许冯邓曹彭曾蒋蔡潘杜戴夏钟汪姜范姚谭廖邹熊陆郝孔崔康邱秦史顾侯邵孟段雷钱汤尹黎易乔贺赖龚聂丁贾邢倪严牛温芦季俞章鲁葛韦贝樊柯翁霍']);

/** Function words and very common verbs — never part of a given name. */
const STOP = new Set([...'的了是在和与也就都很不有我你他她它们个这那些吗呢吧啊之而为以及或但因所把被让向从对于说去来到看想做要能会得着过又还只给']);

const HAN = /[一-鿿]/;
const MAX_DICT = 4;

function bestLen(text: string, i: number, end: number): number {
  for (let len = Math.min(MAX_DICT, end - i); len >= 1; len--) {
    if (isWord(text.slice(i, i + len))) return len;
  }
  return 0;
}

/* ── Transliterated foreign names ────────────────────────────────────────────────────────
 *
 * `guessChineseNames` looks for a Chinese SURNAME followed by a given name, which is the right
 * shape for 李华 and the wrong shape for every foreign name in translated literature. Reading
 * Le Petit Prince, the dedication to Léon Werth — 列翁·维尔特 — came out as six separate
 * characters, each glossed as though it were vocabulary.
 *
 * The middle dot IS the signal. Chinese writes foreign personal names with `·` between the
 * parts and uses it for almost nothing else in running prose, so a Han run touching one is a
 * name part with high confidence.
 *
 * The hard part is where the part ENDS on the left, since the run before the dot runs back
 * into the sentence: in 献给列翁·维尔特 the name is 列翁, not 献给列翁. Transliteration picks
 * characters for their sound, so a name part does not contain everyday grammatical words —
 * scanning outward and stopping at the first HSK 1–2 character lands exactly on the boundary
 * (翁 ✓, 列 ✓, 给 is HSK 2 ✗ stop). It is a heuristic, but its failure mode is a name one
 * character short, which is a great deal better than one shredded into six.
 */

/** `·` and the variants that turn up in real books. */
const NAME_DOT = /[·‧・･]/;

/**
 * Characters that are everyday HSK vocabulary AND standard transliteration syllables.
 *
 * These are the exception the stop-rule needs. 里 is HSK 1, and it is also in a large share of
 * transliterated names — so stopping at it truncated 罗德里格斯 to 罗德 and 圣埃克苏佩里 to
 * 圣埃克苏佩, leaving the remainder to be shredded exactly as before. Kept short and only for
 * syllables that genuinely recur in names, since every entry is a character the scan will
 * now run THROUGH.
 */
const TRANSLIT_CHARS = new Set([
  '里', '尔', '特', '德', '安', '马', '拉', '亚', '利', '加', '美', '大', '力', '斯', '克',
]);

/** Characters common enough that they are sentence, not name. */
const COMMON_CHARS: Set<string> = (() => {
  const s = new Set<string>();
  for (const level of ['1', '2']) {
    for (const w of (HSK_LEVELS as Record<string, string[]>)[level] ?? []) {
      if (w.length === 1 && !TRANSLIT_CHARS.has(w)) s.add(w);
    }
  }
  return s;
})();

/** Longest run either side of the dot we will claim. Real name parts are short. */
const MAX_NAME_PART = 6;

export function guessTransliteratedNames(text: string): string[] {
  const found = new Set<string>();

  const scan = (start: number, step: -1 | 1): string => {
    const chars: string[] = [];
    for (let i = start; i >= 0 && i < text.length && chars.length < MAX_NAME_PART; i += step) {
      const ch = text[i];
      if (!HAN.test(ch) || COMMON_CHARS.has(ch)) break;
      chars.push(ch);
    }
    return step === -1 ? chars.reverse().join('') : chars.join('');
  };

  for (let i = 0; i < text.length; i++) {
    if (!NAME_DOT.test(text[i])) continue;
    for (const part of [scan(i - 1, -1), scan(i + 1, 1)]) {
      // A part that is already a dictionary word is a word, not a name — leaving it alone
      // costs nothing, since the segmenter keeps a real word whole anyway.
      if (part.length >= 1 && !isWord(part)) found.add(part);
    }
  }
  return [...found];
}

export function guessChineseNames(text: string): string[] {
  const counts = new Map<string, number>();
  let i = 0;
  while (i < text.length) {
    if (!HAN.test(text[i])) { i++; continue; }
    let end = i;
    while (end < text.length && HAN.test(text[end])) end++;
    while (i < end) {
      const s = text[i];
      if (SURNAMES.has(s) && bestLen(text, i, end) <= 1) {
        for (const glen of [2, 1]) {
          if (i + 1 + glen > end) continue;
          const given = text.slice(i + 1, i + 1 + glen);
          if ([...given].some(c => STOP.has(c))) continue;
          const full = s + given;
          if (isWord(full)) continue;
          counts.set(full, (counts.get(full) ?? 0) + 1);
        }
      }
      i += Math.max(1, bestLen(text, i, end));
    }
  }

  const kept = new Set<string>();
  for (const [span, n] of counts) {
    if (span.length === 3 ? n >= 2 : true) kept.add(span);
  }
  // A two-character guess wholly contained in a kept three-character one is the same person.
  for (const s of [...kept]) {
    if (s.length === 2 && [...kept].some(o => o.length === 3 && o.startsWith(s))) kept.delete(s);
  }
  return [...kept];
}

/**
 * A pinyin reading for a name, assembled from its characters.
 *
 * Not cosmetic. The client's zh token builder classifies a token as vocab only once a reading
 * resolves, and a name is not in CC-CEDICT — so a name sent with an empty reading came back
 * as untyped plain text, lost its "(name)" gloss, and was then split right back into single
 * characters by the re-segmentation pass. Supplying the reading is what makes the merge
 * survive the round trip, and it matches what the model already sends for generated passages.
 */
export function nameReading(name: string): string {
  const parts: string[] = [];
  for (const ch of name) {
    const p = (cedict[ch]?.p ?? '').split(/[\s,]+/).filter(Boolean)[0] ?? '';
    if (!p) return '';                       // unknown character — better no reading than a wrong one
    parts.push(p.charAt(0).toUpperCase() + p.slice(1));
  }
  return parts.join(' ');
}
