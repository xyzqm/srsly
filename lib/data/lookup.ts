import type { LanguageCode } from '@/lib/types';
import { lookupWord, preloadCedict } from './dict';
import { lookupJa, lookupJaAsync, preloadJmdict } from './jadict';
import { lookupEs, lookupEsAsync, preloadEsdict } from './esdict';
import { lookupKo, lookupKoAsync, preloadKodict } from './kodict';
import { lookupFr, lookupFrAsync, preloadFrdict } from './frdict';

/** Language-neutral dictionary result: `reading` is pinyin (zh) or furigana (ja), and is
 *  always '' for languages with no reading layer (es, ko, fr). */
export interface Reading { reading: string; meaning: string; baseForm?: string; baseReading?: string; }

/** Synchronous, language-aware word lookup. Dispatches to the Chinese (CC-CEDICT),
 *  Japanese (JMdict) or Spanish (Wiktionary) dictionary. Mirrors the per-language
 *  `lookupWord`/`lookupJa`/`lookupEs` but normalises the field name to `reading` so
 *  shared UI doesn't need to know the language. */
export function lookupReading(lang: LanguageCode, text: string, fbReading = '', fbMeaning = ''): Reading {
  if (lang === 'ja') {
    const e = lookupJa(text, fbReading, fbMeaning);
    return { reading: e.reading, meaning: e.meaning, baseForm: e.baseForm, baseReading: e.baseReading };
  }
  if (lang === 'es') {
    const e = lookupEs(text, fbReading, fbMeaning);
    return { reading: e.reading, meaning: e.meaning, baseForm: e.baseForm, baseReading: e.baseReading };
  }
  if (lang === 'ko') {
    const e = lookupKo(text, fbReading, fbMeaning);
    return { reading: e.reading, meaning: e.meaning, baseForm: e.baseForm, baseReading: e.baseReading };
  }
  if (lang === 'fr') {
    const e = lookupFr(text, fbReading, fbMeaning);
    return { reading: e.reading, meaning: e.meaning, baseForm: e.baseForm, baseReading: e.baseReading };
  }
  const e = lookupWord(text, fbReading, fbMeaning);
  return { reading: e.pinyin, meaning: e.meaning };
}

/** Async variant that guarantees the full dictionary is loaded first. */
export async function lookupReadingAsync(lang: LanguageCode, text: string, fbReading = '', fbMeaning = ''): Promise<Reading> {
  if (lang === 'ja') {
    const e = await lookupJaAsync(text, fbReading, fbMeaning);
    return { reading: e.reading, meaning: e.meaning, baseForm: e.baseForm, baseReading: e.baseReading };
  }
  if (lang === 'es') {
    const e = await lookupEsAsync(text, fbReading, fbMeaning);
    return { reading: e.reading, meaning: e.meaning, baseForm: e.baseForm, baseReading: e.baseReading };
  }
  if (lang === 'ko') {
    const e = await lookupKoAsync(text, fbReading, fbMeaning);
    return { reading: e.reading, meaning: e.meaning, baseForm: e.baseForm, baseReading: e.baseReading };
  }
  if (lang === 'fr') {
    const e = await lookupFrAsync(text, fbReading, fbMeaning);
    return { reading: e.reading, meaning: e.meaning, baseForm: e.baseForm, baseReading: e.baseReading };
  }
  const { lookupWordAsync } = await import('./dict');
  const e = await lookupWordAsync(text, fbReading, fbMeaning);
  return { reading: e.pinyin, meaning: e.meaning };
}

/** Preload the full dictionary for a language into memory. */
export async function preloadDict(lang: LanguageCode): Promise<void> {
  if (lang === 'ja') return preloadJmdict();
  if (lang === 'es') return preloadEsdict();
  if (lang === 'ko') return preloadKodict();
  if (lang === 'fr') return preloadFrdict();
  return preloadCedict();
}
