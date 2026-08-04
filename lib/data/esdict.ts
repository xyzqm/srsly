/** A Spanish dictionary entry. `reading` is always '' — Spanish has no pinyin/furigana
 *  analogue — but the field is kept so shared UI can treat every language alike. */
export interface EsEntry { reading: string; meaning: string; baseForm?: string; baseReading?: string; }

type RawEntry = { p: string; m: string };
type VocabEntry = { reading: string; meaning: string };

// Both sources load lazily. The full Wiktionary-derived dictionary (~108k lemmas) is
// fetched as JSON, and the CEFR level vocab — which only serves as a fallback for words
// the fetch hasn't covered — is dynamically imported rather than bundled. Statically
// importing it put ~900 kB of Spanish vocabulary into the initial page bundle for every
// user, including those studying another language entirely.
let esdictCache: Record<string, RawEntry> | null = null;
let baseCache: Record<string, VocabEntry> | null = null;
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      fetch('/esdict.json')
        .then(r => r.json())
        .then(data => { esdictCache = data; })
        .catch(() => { /* offline or missing — fall back to the level vocab */ }),
      import('./cefr-vocab')
        .then(m => { baseCache = m.CEFR_VOCAB; })
        .catch(() => { /* chunk failed to load — the JSON above still serves lookups */ }),
    ]).then(() => undefined);
  }
  return loading;
}

/** Load the full Spanish dictionary into memory so the synchronous `lookupEs` can resolve
 *  any common word. Safe to call repeatedly — the work is cached. */
export async function preloadEsdict(): Promise<void> {
  await load();
}

/** Dictionary headwords are lowercase; passage words may be capitalised at a sentence
 *  start or inside a title, so every lookup normalises case first. */
function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Synchronous lookup. Resolves from the full dictionary (if preloaded) then the baked-in
 * CEFR vocab, falling back to the provided values. No deinflection here — callers resolve
 * conjugated Spanish to its dictionary form before calling (lib/server/spanishSegmenter.ts
 * for AI-generated content, /api/es-word-lookup for manually-added words), mirroring how
 * the Japanese path works.
 */
export function lookupEs(text: string, fbReading = '', fbMeaning = ''): EsEntry {
  const key = normalize(text);
  const e = esdictCache?.[key];
  if (e?.m) return { reading: '', meaning: e.m };
  const b = baseCache?.[key];
  if (b?.meaning) return { reading: '', meaning: b.meaning };
  return { reading: fbReading, meaning: fbMeaning };
}

/** Async lookup that ensures the dictionary is loaded before resolving. */
export async function lookupEsAsync(text: string, fbReading = '', fbMeaning = ''): Promise<EsEntry> {
  await load();
  return lookupEs(text, fbReading, fbMeaning);
}
