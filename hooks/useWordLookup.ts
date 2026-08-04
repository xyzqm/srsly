'use client';
import { useState, useEffect, useRef } from 'react';
import type { LanguageCode } from '@/lib/types';
import { getLanguageConfig } from '@/lib/languageConfig';
import { lookupReadingAsync, preloadDict } from '@/lib/data/lookup';

export type LookupStatus =
  /** Nothing typed yet. */
  | 'idle'
  /** Waiting for the debounce or the lookup itself. */
  | 'loading'
  /** The dictionary has this word. */
  | 'found'
  /** The dictionary does not have this word. */
  | 'not-found'
  /** The lookup could not be completed (offline, server error). Deliberately NOT
   *  'not-found': a network blip must not tell someone their word is made up. */
  | 'error';

export interface LookupResult {
  status: LookupStatus;
  /** The form to store on the card — the dictionary/base form for inflecting languages,
   *  so typing 먹었어요 files the card under 먹다. Empty unless status is 'found'. */
  word: string;
  /** Reading for languages that have one; always '' for es/ko. */
  reading: string;
  /** The dictionary's senses, split into individual definitions. */
  definitions: string[];
}

const EMPTY: LookupResult = { status: 'idle', word: '', reading: '', definitions: [] };

/** Dictionary glosses separate senses with ';' or a middle dot. */
export function splitSenses(meaning: string): string[] {
  return meaning.split(/\s*[;·]\s*/).map(s => s.trim()).filter(Boolean);
}

/** How long to wait after the last keystroke before spending a lookup. */
const DEBOUNCE_MS = 350;

/**
 * Validates a typed word against the bundled dictionaries and returns its official
 * definitions. Used by AddWordForm to keep the deck to real dictionary entries.
 *
 * Two lookup paths, chosen from the language config rather than a hardcoded list:
 *
 *   - Languages that inflect (ja, es, ko) go through `/api/{lang}-word-lookup`, because
 *     resolving a conjugated surface to its dictionary form needs the server-side
 *     segmenter/lemmatizer. This is what lets someone type 먹었어요 and get the 먹다 card.
 *   - Chinese resolves client-side from CC-CEDICT; it has no inflection to undo and so
 *     has no such endpoint.
 *
 * Lookups are debounced and guarded against out-of-order responses — without the guard a
 * slow reply for "먹" could land after a fast reply for "먹었어요" and overwrite it.
 */
export function useWordLookup(text: string, language: LanguageCode): LookupResult {
  const [result, setResult] = useState<LookupResult>(EMPTY);
  /** Incremented per request; a response is applied only if it is still the newest. */
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = text.trim();
    const id = ++requestId.current;

    if (!trimmed) {
      setResult(EMPTY);
      return;
    }

    setResult(prev => (prev.status === 'loading' ? prev : { ...EMPTY, status: 'loading' }));

    const timer = setTimeout(async () => {
      const cfg = getLanguageConfig(language);
      try {
        if (cfg.usesBaseForms) {
          const res = await fetch(`/api/${language}-word-lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: trimmed }),
          });
          if (!res.ok) throw new Error(`lookup failed: ${res.status}`);
          const data = await res.json();
          if (id !== requestId.current) return;
          // `single: false` means the input was a phrase, not one word — there is no single
          // dictionary entry to file it under, so it counts as not found.
          if (!data.single || !data.meaning) {
            setResult({ ...EMPTY, status: 'not-found' });
            return;
          }
          setResult({
            status: 'found',
            word: data.baseForm ?? data.surface ?? trimmed,
            reading: data.reading ?? '',
            definitions: splitSenses(data.meaning),
          });
          return;
        }

        // Client-side dictionary. Ensure it is actually in memory first, or a word that
        // exists would be reported missing purely because the fetch hadn't finished.
        await preloadDict(language);
        const entry = await lookupReadingAsync(language, trimmed);
        if (id !== requestId.current) return;
        if (!entry.meaning) {
          setResult({ ...EMPTY, status: 'not-found' });
          return;
        }
        setResult({
          status: 'found',
          word: trimmed,
          reading: entry.reading ?? '',
          definitions: splitSenses(entry.meaning),
        });
      } catch {
        if (id !== requestId.current) return;
        setResult({ ...EMPTY, status: 'error' });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [text, language]);

  return result;
}
