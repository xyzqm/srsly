import { CEFR_VOCAB } from './cefr-vocab';

/** A Spanish dictionary entry. `reading` is always '' — Spanish has no pinyin/furigana
 *  analogue — but the field is kept so shared UI can treat every language alike. */
export interface EsEntry { reading: string; meaning: string; baseForm?: string; baseReading?: string; }

// CEFR vocab is small enough to keep in memory for synchronous lookups (the analogue of
// the baked-in DICT in dict.ts and BASE in jadict.ts). The full Wiktionary-derived
// dictionary (~108k lemmas) is fetched lazily — see preloadEsdict — and consulted first
// once available.
const BASE: Record<string, EsEntry> = {};
for (const [text, e] of Object.entries(CEFR_VOCAB)) {
  BASE[text] = { reading: '', meaning: e.meaning };
}

type RawEntry = { p: string; m: string };
let esdictCache: Record<string, RawEntry> | null = null;
let esdictLoading: Promise<Record<string, RawEntry>> | null = null;

function getEsdict(): Promise<Record<string, RawEntry>> {
  if (esdictCache) return Promise.resolve(esdictCache);
  if (!esdictLoading) {
    esdictLoading = fetch('/esdict.json')
      .then(r => r.json())
      .then(data => { esdictCache = data; esdictLoading = null; return data; })
      .catch(() => { esdictLoading = null; return {}; });
  }
  return esdictLoading;
}

/** Load the full Spanish dictionary into memory so the synchronous `lookupEs` can resolve
 *  any common word. Safe to call repeatedly — the fetch is cached. */
export async function preloadEsdict(): Promise<void> {
  await getEsdict();
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
  const b = BASE[key];
  if (b?.meaning) return { reading: '', meaning: b.meaning };
  return { reading: fbReading, meaning: fbMeaning };
}

/** Async lookup that ensures the dictionary is loaded before resolving. */
export async function lookupEsAsync(text: string, fbReading = '', fbMeaning = ''): Promise<EsEntry> {
  const dict = await getEsdict();
  const key = normalize(text);
  const e = dict[key];
  if (e?.m) return { reading: '', meaning: e.m };
  const b = BASE[key];
  if (b?.meaning) return { reading: '', meaning: b.meaning };
  return { reading: fbReading, meaning: fbMeaning };
}
