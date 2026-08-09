import { DICT_VERSION } from './dictVersion';
/** A Japanese dictionary entry: hiragana/katakana reading + English meaning. */
export interface JaEntry { reading: string; meaning: string; baseForm?: string; baseReading?: string; }

type RawEntry = { p: string; m: string };
type VocabEntry = { reading: string; meaning: string };

// Both sources load lazily. The full JMdict (~47k forms) is fetched as JSON, and the JLPT
// level vocab — which only serves as a fallback for words the fetch hasn't covered — is
// dynamically imported rather than bundled. Statically importing it put ~585 kB of
// Japanese vocabulary into the initial page bundle for every user, whatever their language.
let jmdictCache: Record<string, RawEntry> | null = null;
let baseCache: Record<string, VocabEntry> | null = null;
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      fetch(`/jmdict.json?v=${DICT_VERSION}`)
        .then(r => r.json())
        .then(data => { jmdictCache = data; })
        .catch(() => { /* offline or missing — fall back to the level vocab */ }),
      import('./jlpt-vocab')
        .then(m => { baseCache = m.JLPT_VOCAB; })
        .catch(() => { /* chunk failed to load — the JSON above still serves lookups */ }),
    ]).then(() => undefined);
  }
  return loading;
}

/** Load the full JMdict into memory so the synchronous `lookupJa` can resolve any common
 *  word. Safe to call repeatedly — the work is cached. */
export async function preloadJmdict(): Promise<void> {
  await load();
}

function dictLookup(dict: Record<string, RawEntry> | null, text: string): RawEntry | undefined {
  return dict?.[text];
}

/**
 * Synchronous lookup. Resolves from JMdict (if preloaded) then the baked-in JLPT vocab,
 * falling back to the provided values. No deinflection here — every caller already resolves
 * conjugated Japanese text to its dictionary form before calling this (kuromoji server-side
 * for AI-generated content, /api/ja-word-lookup for manually-added words), so this is a
 * direct dict lookup only.
 */
export function lookupJa(text: string, fbReading = '', fbMeaning = ''): JaEntry {
  const j = dictLookup(jmdictCache, text);
  if (j) return { reading: j.p || fbReading, meaning: j.m || fbMeaning };
  const b = baseCache?.[text];
  if (b?.meaning) return { reading: b.reading || fbReading, meaning: b.meaning };
  return { reading: fbReading, meaning: fbMeaning };
}

/** Async lookup that ensures JMdict is loaded before resolving. */
export async function lookupJaAsync(text: string, fbReading = '', fbMeaning = ''): Promise<JaEntry> {
  await load();
  return lookupJa(text, fbReading, fbMeaning);
}
