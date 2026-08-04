// Official HSK 2.0 word lists (5,000 words), split by level.
//
// The data lives in the sibling .json file, not as a TypeScript object literal, and is
// imported through the @data alias so TypeScript never opens it — see
// scripts/lib/emitData.mjs and lib/data/json-modules.d.ts. Regenerate both together.
import data from '@data/hsk-levels.json';

export const HSK_LEVELS = data as unknown as Record<number, string[]>;
