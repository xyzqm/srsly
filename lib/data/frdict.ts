import { DICT_VERSION } from './dictVersion';
/** A French dictionary entry. `reading` is always '' — French is written in the same alphabet it is read in, so there is no
 *  pinyin/furigana analogue — but the field is kept so shared UI treats every language alike. */
export interface FrEntry { reading: string; meaning: string; baseForm?: string; baseReading?: string; }

type RawEntry = { p: string; m: string };
type VocabEntry = { reading: string; meaning: string };

// Both sources load lazily. The full Wiktionary-derived dictionary is fetched as JSON, and
// the CEFR level vocab — which only serves as a fallback for words the fetch hasn't
// covered — is dynamically imported rather than bundled. Statically importing it would put
// ~1 MB of French vocabulary into the initial page bundle for every user of every language.
let dictCache: Record<string, RawEntry> | null = null;
let baseCache: Record<string, VocabEntry> | null = null;
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      fetch(`/frdict.json?v=${DICT_VERSION}`)
        .then(r => r.json())
        .then(data => { dictCache = data; })
        .catch(() => { /* offline or missing — fall back to the level vocab */ }),
      import('./fr-vocab')
        .then(m => { baseCache = m.FR_VOCAB; })
        .catch(() => { /* chunk failed to load — the JSON above still serves lookups */ }),
    ]).then(() => undefined);
  }
  return loading;
}

/** Load the French dictionary into memory so the synchronous `lookupFr` can resolve any
 *  common word. Safe to call repeatedly — the work is cached. */
export async function preloadFrdict(): Promise<void> {
  await load();
}

/**
 * Synchronous lookup. Resolves from the full dictionary then the CEFR vocab, falling back
 * to the provided values. No de-inflection here — callers resolve conjugated French to its
 * dictionary form first (lib/server/frenchSegmenter.ts for generated content,
 * /api/fr-word-lookup for manually-added words), mirroring the other languages.
 */
export function lookupFr(text: string, fbReading = '', fbMeaning = ''): FrEntry {
  // Dictionary headwords are lowercase; a passage word may open a sentence or a title, so
  // every lookup normalises case first.
  const key = text.trim().toLowerCase();
  const e = dictCache?.[key];
  if (e?.m) return { reading: '', meaning: e.m };
  const b = baseCache?.[key];
  if (b?.meaning) return { reading: '', meaning: b.meaning };
  return { reading: fbReading, meaning: fbMeaning };
}

/** Async lookup that ensures the dictionary is loaded before resolving. */
export async function lookupFrAsync(text: string, fbReading = '', fbMeaning = ''): Promise<FrEntry> {
  await load();
  return lookupFr(text, fbReading, fbMeaning);
}
