import type { LanguageCode } from '@/lib/types';
import { lookupWord, preloadCedict } from './dict';
import { lookupJa, lookupJaAsync, preloadJmdict } from './jadict';

/** Language-neutral dictionary result: `reading` is pinyin (zh) or furigana (ja). */
export interface Reading { reading: string; meaning: string; }

/** Synchronous, language-aware word lookup. Dispatches to the Chinese (CC-CEDICT) or
 *  Japanese (JMdict) dictionary. Mirrors `lookupWord`/`lookupJa` but normalises the
 *  field name to `reading` so shared UI doesn't need to know the language. */
export function lookupReading(lang: LanguageCode, text: string, fbReading = '', fbMeaning = ''): Reading {
  if (lang === 'ja') return lookupJa(text, fbReading, fbMeaning);
  const e = lookupWord(text, fbReading, fbMeaning);
  return { reading: e.pinyin, meaning: e.meaning };
}

/** Async variant that guarantees the full dictionary is loaded first. */
export async function lookupReadingAsync(lang: LanguageCode, text: string, fbReading = '', fbMeaning = ''): Promise<Reading> {
  if (lang === 'ja') return lookupJaAsync(text, fbReading, fbMeaning);
  const { lookupWordAsync } = await import('./dict');
  const e = await lookupWordAsync(text, fbReading, fbMeaning);
  return { reading: e.pinyin, meaning: e.meaning };
}

/** Preload the full dictionary for a language into memory. */
export async function preloadDict(lang: LanguageCode): Promise<void> {
  if (lang === 'ja') return preloadJmdict();
  return preloadCedict();
}
