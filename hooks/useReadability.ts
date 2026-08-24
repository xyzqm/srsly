'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { loadLevelTable, cachedLevelTable } from '@/lib/curriculum';
import { levelFor } from '@/lib/languageConfig';
import { storage } from '@/lib/storage';
import {
  buildLevelIndex, calculateReadability, MIN_TOKENS, type LevelBands, type Readability,
} from '@/lib/readability';
import type { PassageToken } from '@/lib/types';

/**
 * The level table as a word-to-band lookup, loaded lazily and built once.
 *
 * The tables are 338 kB to 900 kB and are already lazy everywhere else (see lib/curriculum.ts);
 * this follows the same contract, including seeding from the synchronous cache so a second
 * passage shows its figure on the first frame instead of blinking it in a commit late.
 */
function useLevelIndex(): Map<string, number> | null {
  const language = useLanguage();
  const [index, setIndex] = useState<Map<string, number> | null>(() => {
    const t = cachedLevelTable(language);
    return t ? buildLevelIndex(t as LevelBands) : null;
  });

  useEffect(() => {
    let live = true;
    const cached = cachedLevelTable(language);
    setIndex(cached ? buildLevelIndex(cached as LevelBands) : null);
    void loadLevelTable(language).then(table => {
      if (live && table) setIndex(buildLevelIndex(table as LevelBands));
    });
    return () => { live = false; };
  }, [language]);

  return index;
}

/** The learner's own band for the active language. */
function useLevel(): number | null {
  const language = useLanguage();
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void storage.getPrefs().then(p => { if (live) setLevel(levelFor(language, p)); });
    return () => { live = false; };
  }, [language]);
  return level;
}

/**
 * How much of `tokens` sits at or below the learner's level.
 *
 * Null until the level table has loaded, and null for a text too short to measure. A six-word
 * caption can only ever score 0%, 50% or 100%, and a percentage that precise about that little
 * text is a worse answer than none.
 */
export function useReadability(tokens: PassageToken[] | null | undefined): Readability | null {
  const index = useLevelIndex();
  const level = useLevel();
  if (!tokens || !index || level === null) return null;
  const result = calculateReadability(tokens, index, level);
  return result.tokens >= MIN_TOKENS ? result : null;
}

/**
 * The same measurement for text that has not been segmented yet, used for a book estimate.
 *
 * Segmentation is server-side for every language, so this costs one request per sample. That
 * is why the caller passes a handful of excerpts rather than a whole book: see `sampleChapters`
 * in lib/readability.ts for why an estimate is the right shape here.
 */
export function useTextReadability(samples: string[] | null): Readability | null {
  const language = useLanguage();
  const index = useLevelIndex();
  const level = useLevel();
  const [tokens, setTokens] = useState<PassageToken[] | null>(null);
  const key = samples?.join(' ') ?? '';

  useEffect(() => {
    let live = true;
    setTokens(null);
    if (!key) return;
    void (async () => {
      const out: PassageToken[] = [];
      for (const text of samples ?? []) {
        try {
          const res = await fetch('/api/segment-text', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ language, text }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          for (const sentence of data.sentences ?? []) {
            for (const t of sentence) {
              out.push({
                text: t[0], reading: t[1], meaning: t[2], baseForm: t[3],
                type: t.length === 1 ? 'punct' : undefined,
              });
            }
          }
        } catch { /* a sample that fails simply does not contribute to the estimate */ }
      }
      if (live) setTokens(out);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, language]);

  if (!tokens || !index || level === null) return null;
  const result = calculateReadability(tokens, index, level);
  return result.tokens >= MIN_TOKENS ? result : null;
}
