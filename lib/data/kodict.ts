/** A Korean dictionary entry. `reading` is always '' — Hangul is phonetic, so there is no
 *  pinyin/furigana analogue — but the field is kept so shared UI treats every language alike. */
export interface KoEntry { reading: string; meaning: string; baseForm?: string; baseReading?: string; }

type RawEntry = { p: string; m: string };
type VocabEntry = { reading: string; meaning: string };

// Both sources load lazily. The full Wiktionary-derived dictionary is fetched as JSON, and
// the TOPIK level vocab — which only serves as a fallback for words the fetch hasn't
// covered — is dynamically imported rather than bundled. Statically importing it would put
// ~1 MB of Korean vocabulary into the initial page bundle for every user of every language.
let dictCache: Record<string, RawEntry> | null = null;
let baseCache: Record<string, VocabEntry> | null = null;
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      fetch('/kodict.json')
        .then(r => r.json())
        .then(data => { dictCache = data; })
        .catch(() => { /* offline or missing — fall back to the level vocab */ }),
      import('./topik-vocab')
        .then(m => { baseCache = m.TOPIK_VOCAB; })
        .catch(() => { /* chunk failed to load — the JSON above still serves lookups */ }),
    ]).then(() => undefined);
  }
  return loading;
}

/** Load the Korean dictionary into memory so the synchronous `lookupKo` can resolve any
 *  common word. Safe to call repeatedly — the work is cached. */
export async function preloadKodict(): Promise<void> {
  await load();
}

/**
 * Synchronous lookup. Resolves from the full dictionary then the TOPIK vocab, falling back
 * to the provided values. No de-inflection here — callers resolve conjugated Korean to its
 * dictionary form first (lib/server/koreanSegmenter.ts for generated content,
 * /api/ko-word-lookup for manually-added words), mirroring the other languages.
 */
export function lookupKo(text: string, fbReading = '', fbMeaning = ''): KoEntry {
  const key = text.trim();
  const e = dictCache?.[key];
  if (e?.m) return { reading: '', meaning: e.m };
  const b = baseCache?.[key];
  if (b?.meaning) return { reading: '', meaning: b.meaning };
  return { reading: fbReading, meaning: fbMeaning };
}

/** Async lookup that ensures the dictionary is loaded before resolving. */
export async function lookupKoAsync(text: string, fbReading = '', fbMeaning = ''): Promise<KoEntry> {
  await load();
  return lookupKo(text, fbReading, fbMeaning);
}
