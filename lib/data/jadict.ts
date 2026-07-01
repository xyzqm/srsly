import { JLPT_VOCAB } from './jlpt-vocab';

/** A Japanese dictionary entry: hiragana/katakana reading + English meaning. */
export interface JaEntry { reading: string; meaning: string; baseForm?: string; baseReading?: string; }

// JLPT vocab is small enough to keep in memory for synchronous lookups (the analogue of
// the baked-in DICT in dict.ts). The full JMdict (~47k forms) is fetched lazily — see
// preloadJmdict — and consulted first once available.
const BASE: Record<string, JaEntry> = {};
for (const [text, e] of Object.entries(JLPT_VOCAB)) {
  BASE[text] = { reading: e.reading, meaning: e.meaning };
}

type RawEntry = { p: string; m: string };
let jmdictCache: Record<string, RawEntry> | null = null;
let jmdictLoading: Promise<Record<string, RawEntry>> | null = null;

function getJmdict(): Promise<Record<string, RawEntry>> {
  if (jmdictCache) return Promise.resolve(jmdictCache);
  if (!jmdictLoading) {
    jmdictLoading = fetch('/jmdict.json')
      .then(r => r.json())
      .then(data => { jmdictCache = data; jmdictLoading = null; return data; })
      .catch(() => { jmdictLoading = null; return {}; });
  }
  return jmdictLoading;
}

/** Load the full JMdict into memory so the synchronous `lookupJa` can resolve any common
 *  word. Safe to call repeatedly — the fetch is cached. */
export async function preloadJmdict(): Promise<void> {
  await getJmdict();
}

// ---------------------------------------------------------------------------
// Deinflection — strip conjugation suffixes to recover the dictionary form.
// Rules are [suffix, replacements[]]; tried in order (longest first so godan-
// specific endings like りました are matched before the generic ました).
// ---------------------------------------------------------------------------

// Full-word irregular conjugations that can't be recovered by suffix rules alone.
const IRREGULAR_CONJ: Record<string, string> = {
  'します': 'する', 'しました': 'する', 'して': 'する', 'した': 'する', 'しない': 'する', 'しろ': 'する',
  'きます': '来る', 'きました': '来る', 'きて': '来る', 'きた': '来る', 'こない': '来る', 'こい': '来る',
  '来ます': '来る', '来ました': '来る', '来て': '来る', '来た': '来る', '来ない': '来る',
};

type Rule = readonly [suffix: string, repls: readonly string[]];

const DEINFLECT_RULES: Rule[] = [
  // Copula (です) — na-adjective and noun predicate forms; longest first
  ['ではありませんでした', ['']],
  ['じゃありませんでした', ['']],
  ['ではありません',      ['']],
  ['じゃありません',      ['']],
  ['ではなかった',        ['']],
  ['じゃなかった',        ['']],
  ['ではない',            ['']],
  ['じゃない',            ['']],
  ['でした',              ['']],
  ['です',                ['']],
  // Polite past — godan-specific (longer suffixes first to avoid false matches)
  ['りました', ['る']],
  ['いました', ['う']],
  ['きました', ['く']],
  ['ぎました', ['ぐ']],
  ['しました', ['す']],
  ['ちました', ['つ']],
  ['にました', ['ぬ']],
  ['びました', ['ぶ']],
  ['みました', ['む']],
  ['ました',   ['る']],   // ichidan
  // Polite present
  ['ります', ['る']],
  ['います', ['う']],
  ['きます', ['く']],
  ['ぎます', ['ぐ']],
  ['します', ['す']],
  ['ちます', ['つ']],
  ['にます', ['ぬ']],
  ['びます', ['ぶ']],
  ['みます', ['む']],
  ['ます',   ['る']],     // ichidan
  // Te-form
  ['って', ['う', 'つ', 'る']],  // godan -u/-tsu/-ru (ambiguous)
  ['いて', ['く']],
  ['いで', ['ぐ']],
  ['して', ['す']],
  ['んで', ['ぬ', 'ぶ', 'む']], // godan -nu/-bu/-mu (ambiguous)
  ['て',   ['る']],       // ichidan
  // Plain past
  ['った', ['う', 'つ', 'る']],
  ['いた', ['く']],
  ['いだ', ['ぐ']],
  ['した', ['す']],
  ['んだ', ['ぬ', 'ぶ', 'む']],
  ['た',   ['る']],       // ichidan
  // Negative
  ['わない', ['う']],
  ['かない', ['く']],
  ['がない', ['ぐ']],
  ['さない', ['す']],
  ['たない', ['つ']],
  ['なない', ['ぬ']],
  ['ばない', ['ぶ']],
  ['まない', ['む']],
  ['らない', ['る']],
  ['ない',   ['る']],     // ichidan
  // I-adjective forms
  ['くなかった', ['い']],
  ['かった',    ['い']],  // plain past: 高かった → 高い
  ['くない',    ['い']],  // negative:   高くない → 高い
  ['くて',      ['い']],  // te-form:    高くて   → 高い
  ['ければ',    ['い']],  // conditional: 高ければ → 高い
];

/**
 * Returns candidate dictionary forms for a conjugated word.
 * Checks full-word irregular conjugations first, then applies suffix rules.
 * Each candidate is a possible base form to look up in JMdict.
 */
export function deinflect(text: string): string[] {
  const irr = IRREGULAR_CONJ[text];
  if (irr) return [irr];

  const candidates: string[] = [];
  for (const [suffix, repls] of DEINFLECT_RULES) {
    if (text.length > suffix.length && text.endsWith(suffix)) {
      const stem = text.slice(0, -suffix.length);
      for (const r of repls) candidates.push(stem + r);
    }
  }
  return candidates;
}

function dictLookup(dict: Record<string, RawEntry> | null, text: string): RawEntry | undefined {
  return dict?.[text];
}

/** Synchronous lookup. Resolves from JMdict (if preloaded) then the baked-in JLPT vocab,
 *  falling back to the provided values. Falls through to deinflection on miss. */
export function lookupJa(text: string, fbReading = '', fbMeaning = ''): JaEntry {
  // Exact match
  const j = dictLookup(jmdictCache, text);
  if (j) return { reading: j.p || fbReading, meaning: j.m || fbMeaning };
  const b = BASE[text];
  if (b?.meaning) return { reading: b.reading || fbReading, meaning: b.meaning };

  // Deinflect and retry
  for (const candidate of deinflect(text)) {
    const jc = dictLookup(jmdictCache, candidate);
    if (jc?.m) return { reading: fbReading || jc.p, meaning: jc.m, baseForm: candidate, baseReading: jc.p };
    const bc = BASE[candidate];
    if (bc?.meaning) return { reading: fbReading || bc.reading, meaning: bc.meaning, baseForm: candidate, baseReading: bc.reading };
  }

  return { reading: fbReading, meaning: fbMeaning };
}

/** Async lookup that ensures JMdict is loaded before resolving. */
export async function lookupJaAsync(text: string, fbReading = '', fbMeaning = ''): Promise<JaEntry> {
  const dict = await getJmdict();

  // Exact match
  const j = dict[text];
  if (j?.m) return { reading: j.p || fbReading, meaning: j.m };
  const b = BASE[text];
  if (b?.meaning) return { reading: b.reading || fbReading, meaning: b.meaning };

  // Deinflect and retry
  for (const candidate of deinflect(text)) {
    const jc = dict[candidate];
    if (jc?.m) return { reading: fbReading || jc.p, meaning: jc.m, baseForm: candidate, baseReading: jc.p };
    const bc = BASE[candidate];
    if (bc?.meaning) return { reading: fbReading || bc.reading, meaning: bc.meaning, baseForm: candidate, baseReading: bc.reading };
  }

  return { reading: fbReading, meaning: fbMeaning };
}
