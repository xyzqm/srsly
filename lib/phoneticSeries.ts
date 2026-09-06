/**
 * Phonetic series — 青 gives the SOUND, 氵忄讠 give the MEANING.
 *
 * 清 qīng, 情 qíng, 请 qǐng all carry 青; what differs is water / heart / speech. That is the
 * single most useful structural fact about Chinese characters, and `lib/data/han-decomp.json`
 * has held it all along: every pictophonetic entry carries `ph` (the phonetic part) and `se`
 * (the semantic part) beside the radical it already showed.
 *
 * ── THE MEASUREMENT THAT SHAPED THIS FILE ──
 * Having the data is not the same as the data being TRUE. Phonetic reliability in Mandarin has
 * decayed over a thousand years, and a feature that presents every series as predictive would
 * teach wrong guesses at scale. Measured against cedict's own readings:
 *
 *   者  14 members, the biggest family in the set — 猪诸著渚煮箸 zhu, 堵睹赌 du, 暑署 shu,
 *       奢 she, 绪 xu, 都 dou. Best cluster 43%.
 *   隹   9 members, NINE readings: zhun dui tui chui huai zhuo zhi wei shei.
 *   合   7 members: ha qia na he gei da ge.
 *
 * So reliability is computed per family and always shown. It is NOT an admission ticket:
 * 者 split into three clean clusters is a better lesson than 者 hidden, because
 * overgeneralising from a phonetic is the exact mistake this feature exists to prevent.
 *
 * ── WHY THE FAMILY IS COMPARED WITH ITSELF, NOT WITH ITS PHONETIC ──
 * The obvious test is "does the member read like 青?" and it is the wrong one. 长 is cháng, yet
 * 帐张胀账 are all zhāng; 则 is zé, yet 侧厕测 are all cè. Those are perfectly teachable — the
 * shared sound IS the lesson and the component is only the hook. Scoring on agreement with the
 * component reports 0% for a family that is in fact completely consistent.
 *
 * ── AND WHY A MODAL SHARE RATHER THAN UNANIMITY ──
 * Requiring every member to agree sounds rigorous and is a size filter in disguise: measured,
 * every unanimous family had 3 to 5 members and not one larger family passed. It also excluded
 * 青 itself (清情请晴 qing, 睛精 jing, 猜 cai), which is to say it excluded the textbook example
 * of the thing being taught.
 *
 * ── TONE IS NOT PREDICTED, EVER ──
 * Every comparison here ignores tone, because phonetics do not carry it: 妈麻马骂 share 马 and
 * run through all four tones. The UI has to say so once; a learner who infers otherwise has
 * been taught something false by omission.
 */
import type { HanEntry } from './hanDecomp';

/** A pinyin syllable with the tone removed. `ü` survives — it is a vowel, not a tone mark. */
export function toneless(pinyin: string): string {
  if (!pinyin) return '';
  let s = pinyin.trim().split(/\s+/)[0].toLowerCase();
  // `ü` is PARKED behind a sentinel first, because NFD decomposes it into u + diaeresis
  // and the combining-mark strip below cannot tell that diaeresis from a tone mark. Losing
  // it would merge 女 nü with 努 nu, which are different syllables.
  const PARK = '\u0001';
  for (const u of 'ǖǘǚǜü') s = s.replaceAll(u, PARK);
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return s.replaceAll(PARK, 'ü');
}

/** Longest-first, so `zh` is not read as `z`. */
const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
  'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's'];

function splitSyllable(s: string): [string, string] {
  for (const i of INITIALS) if (s.startsWith(i)) return [i, s.slice(i.length)];
  return ['', s];
}

/**
 * Initials close enough that a learner guessing one for the other is CLOSE, not wrong.
 *
 * ── THIS IS AN OPINION WITH A PERCENTAGE ATTACHED, AND THE TWO HALVES DIFFER IN KIND ──
 *
 * HISTORICAL. `{g k h} ↔ {j q x}` and `{z c s} ↔ {j q x}` are one sound change seen from
 * either side: j/q/x arose from exactly those two sources before front vowels. 青 qīng /
 * 睛 jīng is that change, which is why 青 scores 57% on a strict reading and 86% here.
 *
 * PEDAGOGICAL. `{zh ch sh r} ↔ {z c s}` is not one sound change — the retroflex/dental split
 * is older than most of these borrowings. It is included because a learner who says `zi` for
 * `zhi` has very nearly got it, and many speakers merge the two. Question this pair first if
 * the numbers ever need revisiting.
 *
 * ── PAIRWISE, NEVER TRANSITIVE ──
 * Merging these into equivalence classes collapses every sibilant and velar in Mandarin into
 * one bucket, because the chain runs zh·ch·sh·r ↔ z·c·s ↔ j·q·x ↔ g·k·h — two hops from zh to
 * j, three to g. The threshold would then filter nothing, and the failure is SILENT: the
 * numbers simply improve and nothing looks wrong. `tests/phoneticSeries.test.ts` asserts
 * `zh` and `g` are not tolerant of each other, which is the assertion that catches it.
 */
const PLACE: Record<string, string> = {
  b: 'labial', p: 'labial', m: 'labial', f: 'labial',
  d: 'alveolar-stop', t: 'alveolar-stop', n: 'alveolar-stop', l: 'alveolar-stop',
  g: 'velar', k: 'velar', h: 'velar',
  j: 'palatal', q: 'palatal', x: 'palatal',
  zh: 'retroflex', ch: 'retroflex', sh: 'retroflex', r: 'retroflex',
  z: 'sibilant', c: 'sibilant', s: 'sibilant',
  '': 'zero',
};

/** Unordered pairs. Read as a LIST of two-element links, never unioned into classes. */
const TOLERANT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['velar', 'palatal'],        // historical: palatalization of g/k/h before front vowels
  ['sibilant', 'palatal'],     // historical: the other source of j/q/x
  ['retroflex', 'sibilant'],   // pedagogical: near-miss for a learner, not one sound change
];

/** Do two syllables differ only in a way a learner would call "close"? Finals must match. */
export function nearSyllable(a: string, b: string): boolean {
  if (a === b) return true;
  const [ia, fa] = splitSyllable(a);
  const [ib, fb] = splitSyllable(b);
  if (fa !== fb || !fa) return false;
  const pa = PLACE[ia], pb = PLACE[ib];
  if (pa === undefined || pb === undefined) return false;
  if (pa === pb) return true;
  return TOLERANT_PAIRS.some(([x, y]) => (pa === x && pb === y) || (pa === y && pb === x));
}

/** A family reaching this share of one sound is called predictive in the UI. */
export const RELIABLE_THRESHOLD = 0.8;

export interface SeriesMember { char: string; reading: string }

export interface PhoneticSeries {
  /** The shared component — 青. */
  phonetic: string;
  /** Every character built on it that has a reading, including the unreliable ones. */
  members: SeriesMember[];
  /** The reading the largest cluster shares, tone ignored. */
  modalReading: string;
  /** Size of that cluster over the whole family, 0–1. */
  reliability: number;
  /** True at or above RELIABLE_THRESHOLD — a property to SHOW, never a filter to apply. */
  predictive: boolean;
}

/** Families are grouped from the decomposition; readings come from the caller's dictionary. */
export function buildSeries(
  decomp: Record<string, HanEntry>,
  readingOf: (char: string) => string | undefined,
  minMembers = 3,
): Map<string, PhoneticSeries> {
  const byPhonetic = new Map<string, SeriesMember[]>();
  for (const [char, entry] of Object.entries(decomp)) {
    const ph = entry.ph;
    if (!ph) continue;
    const reading = toneless(readingOf(char) ?? '');
    if (!reading) continue;
    const list = byPhonetic.get(ph);
    if (list) list.push({ char, reading });
    else byPhonetic.set(ph, [{ char, reading }]);
  }

  const out = new Map<string, PhoneticSeries>();
  for (const [phonetic, members] of byPhonetic) {
    if (members.length < minMembers) continue;
    let best = { reading: members[0].reading, n: 0 };
    for (const { reading } of members) {
      const n = members.filter(m => nearSyllable(reading, m.reading)).length;
      if (n > best.n) best = { reading, n };
    }
    const reliability = best.n / members.length;
    out.set(phonetic, {
      phonetic,
      members,
      modalReading: best.reading,
      reliability,
      predictive: reliability >= RELIABLE_THRESHOLD,
    });
  }
  return out;
}

/**
 * The members of a family grouped by sound, biggest cluster first.
 *
 * This is what makes an UNRELIABLE family teachable rather than merely hidden: 者 is not noise,
 * it is 猪诸著渚煮箸 zhū, then 堵睹赌 dǔ, then 暑署 shǔ. Shown that way it teaches the real
 * lesson — that a phonetic narrows the guess and does not settle it.
 */
export function clusters(series: PhoneticSeries): SeriesMember[][] {
  const left = [...series.members];
  const out: SeriesMember[][] = [];
  while (left.length > 0) {
    const seed = left[0].reading;
    const group = left.filter(m => nearSyllable(seed, m.reading));
    for (const m of group) left.splice(left.indexOf(m), 1);
    out.push(group);
  }
  return out.sort((a, b) => b.length - a.length);
}
