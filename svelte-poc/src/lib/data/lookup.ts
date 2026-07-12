import type { LanguageCode } from '../types';
import { lookupWord, lookupWordAsync, preloadCedict } from './dict';

/** Language-neutral dictionary result: `reading` is pinyin (zh). PoC is Chinese-only. */
export interface Reading { reading: string; meaning: string; baseForm?: string; baseReading?: string; }

/** Synchronous, language-aware word lookup. PoC supports Chinese (CC-CEDICT) only;
 *  Japanese would dispatch to JMdict here in the full app. */
export function lookupReading(_lang: LanguageCode, text: string, fbReading = '', fbMeaning = ''): Reading {
  const e = lookupWord(text, fbReading, fbMeaning);
  return { reading: e.pinyin, meaning: e.meaning };
}

/** Async variant that guarantees the full dictionary is loaded first. */
export async function lookupReadingAsync(_lang: LanguageCode, text: string, fbReading = '', fbMeaning = ''): Promise<Reading> {
  const e = await lookupWordAsync(text, fbReading, fbMeaning);
  return { reading: e.pinyin, meaning: e.meaning };
}

/** Preload the full dictionary for a language into memory. */
export async function preloadDict(_lang: LanguageCode): Promise<void> {
  return preloadCedict();
}
