/**
 * Complete HSK 1-6 vocabulary dictionary (official HSK 2.0 standard, 5,000 words).
 * Word-to-level assignment sourced from the official HSK 2.0 word lists;
 * pinyin/meaning drawn from curated entries where available, else CC-CEDICT.
 * Used as the primary lookup supplement in lib/data/dict.ts.
 */
//
// The data lives in the sibling .json file, not as a TypeScript object literal, and is
// imported through the @data alias so TypeScript never opens it — see
// scripts/lib/emitData.mjs and lib/data/json-modules.d.ts. Regenerate both together.
import data from '@data/hsk-vocab.json';

export const HSK_VOCAB = data as unknown as Record<string, { pinyin: string; meaning: string }>;
