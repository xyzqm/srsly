'use client';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { loadLevelTable, cachedLevelTable, loadVocabTable } from '@/lib/curriculum';
import { levelFor, getLanguageConfig } from '@/lib/languageConfig';
import { storage } from '@/lib/storage';
import {
  buildLevelIndex, calculateReadability, MIN_TOKENS, type LevelBands, type Readability,
} from '@/lib/readability';
import { JA_GRAMMAR_WORDS } from '@/lib/japaneseGrammar';
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
  // Level numbers easiest → hardest. JLPT counts down (N5 is the beginner level), so a raw
  // numeric comparison scores Japanese backwards — see buildLevelIndex.
  const order = useMemo(
    () => getLanguageConfig(language).levels.map(l => l.level),
    [language],
  );
  const [index, setIndex] = useState<Map<string, number> | null>(() => {
    const t = cachedLevelTable(language);
    return t ? buildLevelIndex(t as LevelBands, order) : null;
  });

  useEffect(() => {
    let live = true;
    const cached = cachedLevelTable(language);
    setIndex(cached ? buildLevelIndex(cached as LevelBands, order) : null);
    void (async () => {
      const table = await loadLevelTable(language);
      if (!live || !table) return;
      const built = buildLevelIndex(table as LevelBands, order);

      /**
       * Japanese gets a second set of keys: the READING of every graded word.
       *
       * The JLPT list is written in formal orthography — 御飯 where real text says ご飯, 友達
       * where it says 友だち — so ordinary N5 words missed the index entirely and turned up
       * among a beginner text's hardest words. The level VOCAB table carries each word's
       * reading, so joining the two lets the kana bridge the two spellings.
       */
      if (language === 'ja') {
        const vocab = await loadVocabTable(language);
        if (!live) return;
        if (vocab) {
          for (const [word, rank] of [...built]) {
            const reading = vocab[word]?.reading;
            if (reading && !built.has(reading)) built.set(reading, rank);
          }
        }
      }
      if (live) setIndex(built);
    })();
    return () => { live = false; };
  }, [language, order]);

  return index;
}

/**
 * Words the active language treats as grammar rather than vocabulary.
 *
 * Japanese is the case that needs it: no JLPT list contains を or に, so without this every
 * particle counted as above-level and crowded out the real hard words.
 */
function useUngradeable(): ((form: string) => boolean) | undefined {
  const language = useLanguage();
  return useMemo(
    () => (language === 'ja' ? (form: string) => JA_GRAMMAR_WORDS.has(form) : undefined),
    [language],
  );
}

/**
 * A second key to try when the surface misses.
 *
 * Japanese only: the JLPT list is written in formal orthography (御飯, 友達) where real text
 * says ご飯 and 友だち, so ordinary N5 words read as unranked. The reading is the bridge.
 */
function useAltKey(): ((t: PassageToken) => string | undefined) | undefined {
  const language = useLanguage();
  return useMemo(
    () => (language === 'ja' ? (t: PassageToken) => t.reading || undefined : undefined),
    [language],
  );
}

/** The same easiest → hardest order, for the comparison inside calculateReadability. */
function useLevelOrder(): number[] {
  const language = useLanguage();
  return useMemo(() => getLanguageConfig(language).levels.map(l => l.level), [language]);
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
  const order = useLevelOrder();
  const ungradeable = useUngradeable();
  const altKey = useAltKey();
  // A level the scale does not contain means the learner cannot be placed, so there is no
  // question to answer — better silence than a confident "0% · very hard".
  if (!tokens || !index || level === null || !order.includes(level)) return null;
  const result = calculateReadability(tokens, index, level, order, ungradeable, altKey);
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
  const order = useLevelOrder();
  const ungradeable = useUngradeable();
  const altKey = useAltKey();
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

  if (!tokens || !index || level === null || !order.includes(level)) return null;
  const result = calculateReadability(tokens, index, level, order, ungradeable, altKey);
  return result.tokens >= MIN_TOKENS ? result : null;
}
