import { JLPT_VOCAB } from './jlpt-vocab';

/** A Japanese dictionary entry: hiragana/katakana reading + English meaning. */
export interface JaEntry { reading: string; meaning: string; }

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

/** Synchronous lookup. Resolves from JMdict (if preloaded) then the baked-in JLPT vocab,
 *  falling back to the provided values. */
export function lookupJa(text: string, fbReading = '', fbMeaning = ''): JaEntry {
  if (jmdictCache) {
    const j = jmdictCache[text];
    if (j) return { reading: j.p || fbReading, meaning: j.m || fbMeaning };
  }
  const b = BASE[text];
  if (b) return { reading: b.reading || fbReading, meaning: b.meaning || fbMeaning };
  return { reading: fbReading, meaning: fbMeaning };
}

/** Async lookup that ensures JMdict is loaded before resolving. */
export async function lookupJaAsync(text: string, fbReading = '', fbMeaning = ''): Promise<JaEntry> {
  const local = lookupJa(text, fbReading, fbMeaning);
  if (local.reading && local.meaning) return local;
  try {
    const dict = await getJmdict();
    const e = dict[text];
    if (e) return { reading: e.p || fbReading, meaning: e.m || fbMeaning };
  } catch { /* ignore */ }
  return { reading: local.reading || fbReading, meaning: local.meaning || fbMeaning };
}
