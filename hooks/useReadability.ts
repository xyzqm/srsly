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
import { loadEsForms, cachedEsForms } from '@/lib/spanishForms';
import { lookupEs, esdictReady } from '@/lib/data/esdict';
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
 * Spanish inflection → lemma, loaded lazily and only where it is used.
 *
 * The bands are keyed by lemma and the server deliberately does not lemmatize a surface that
 * is itself a common headword, so `una`, `son`, `hay` and `sus` reach the metric unbanded —
 * see lib/spanishForms.ts, which carries the measurement and the argument.
 */
function useEsForms(): Record<string, string> | null {
  const language = useLanguage();
  const [forms, setForms] = useState<Record<string, string> | null>(
    () => (language === 'es' ? cachedEsForms() : null),
  );
  useEffect(() => {
    if (language !== 'es') { setForms(null); return; }
    let live = true;
    setForms(cachedEsForms());
    void loadEsForms().then(f => { if (live) setForms(f); });
    return () => { live = false; };
  }, [language]);
  return forms;
}

/**
 * Words the active language cannot fairly grade, excluded rather than counted.
 *
 * TWO DIFFERENT REASONS, and the parameter serves both because `calculateReadability` only
 * ever applies it as "this AND the index does not know the form".
 *
 * JAPANESE — GRAMMAR. No JLPT list contains を or に, so without this every particle counted
 * as above-level and crowded out the real hard words.
 *
 * SPANISH — PROPER NOUNS THE MODEL GLOSSED ITSELF. The dictionary is right to have no entry
 * for Madrid; `nameFilter.mjs` strips place names at build time precisely so a novel's
 * characters resolve to nothing and are excluded. What readability could not see is that the
 * generator glosses names through its own `names` side-channel — the route passes the model's
 * short English gloss straight onto the token — so `Madrid` arrives carrying
 * "(place) Madrid", is therefore resolvable, and is measured and counted as above-level.
 * Sniffing for "(place)" would be reading a phrasing the model chose and the prompt never
 * asked for. The honest test is whether this app has ANY lexical record of the surface: no
 * dictionary entry and no entry in the form table means it is not a vocabulary item at all.
 *
 * Gated on the dictionary having actually loaded, because "not in the dictionary" and "the
 * dictionary is not here yet" are opposite answers and the second one would exclude the whole
 * passage. Until it lands, nothing is excluded and the behaviour is exactly what it was.
 */
function useUngradeable(
  esForms: Record<string, string> | null,
): ((form: string) => boolean) | undefined {
  const language = useLanguage();
  return useMemo(() => {
    if (language === 'ja') return (form: string) => JA_GRAMMAR_WORDS.has(form);
    if (language === 'es' && esdictReady()) {
      return (form: string) => !lookupEs(form).meaning && !esForms?.[form];
    }
    return undefined;
  }, [language, esForms]);
}

/**
 * A second key to try when the surface misses.
 *
 * Japanese only: the JLPT list is written in formal orthography (御飯, 友達) where real text
 * says ご飯 and 友だち, so ordinary N5 words read as unranked. The reading is the bridge.
 */
function useAltKey(
  esForms: Record<string, string> | null,
): ((t: PassageToken) => string | undefined) | undefined {
  const language = useLanguage();
  return useMemo(() => {
    if (language === 'ja') return (t: PassageToken) => t.reading || undefined;
    // Spanish: the lemma of an inflection the server left alone. Measured at 6.9% of all
    // tokens before this existed — see lib/spanishForms.ts.
    if (language === 'es' && esForms) {
      return (t: PassageToken) => esForms[(t.baseForm ?? t.text).trim().toLowerCase()];
    }
    return undefined;
  }, [language, esForms]);
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
  const esForms = useEsForms();
  const ungradeable = useUngradeable(esForms);
  const altKey = useAltKey(esForms);
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
  const esForms = useEsForms();
  const ungradeable = useUngradeable(esForms);
  const altKey = useAltKey(esForms);
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
