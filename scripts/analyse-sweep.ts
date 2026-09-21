import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildLevelIndex, calculateReadability, MIN_TOKENS, type LevelBands } from '../lib/readability';
import type { PassageToken } from '../lib/types';
import BANDS from '@data/cefr-levels.json';
import ES_FORMS from '@data/es-forms.json';
import ESDICT from '@dict/esdict.json';

/**
 * What share of a generated passage sits ABOVE the level it was written for.
 *
 *   SWEEP_DIR=/tmp/sweep-groq npx vitest run --config scripts/analyse-sweep.vitest.mts
 *
 * Reads the dumps `scripts/sweep-readability.mjs` writes and measures them with
 * `lib/readability.ts` — the app's OWN metric, on the app's own normalised tokens, which is the
 * whole reason that sweep drives the UI rather than the API. It writes `readability.txt` beside
 * the dumps as well as printing, because vitest swallows stdout depending on how it is invoked
 * and a measurement you cannot get back out is not one.
 *
 * ── THE EXCLUSIONS ARE THE APP'S, NOT THIS SCRIPT'S ──
 * `ungradeable` and `altKey` are rebuilt exactly as `hooks/useReadability.ts` builds them for
 * Spanish: a surface with no dictionary entry and no form-table entry is not a vocabulary item
 * (which is what keeps the generator's own glossed place names out), and a form the server left
 * unlemmatised is retried through `es-forms`. Diverging from the hook here would produce a
 * number the app never shows.
 *
 * ── TWO NUMBERS, AND POOLED IS THE ONE TO QUOTE ──
 * POOLED weights every token equally, so one long passage counts more than one short one —
 * that is the share of words a reader actually meets. PER-PASSAGE MEAN weights every passage
 * equally and carries the spread, which is what says whether a difference is real. They are
 * printed together because a gap between them means passage length is correlated with
 * difficulty.
 *
 * ── AND THE SAMPLE SIZE IS THE POINT ──
 * CLAUDE.md records a round of topic cuts measuring 13.1% against 12.8% and calls it "not a
 * result": ten passages can only resolve about 5 percentage points. So `n` and the standard
 * deviation are printed on every line, and anything below `MIN_TOKENS` is dropped rather than
 * averaged in — a 20-token passage can only score in coarse steps and would move a mean it has
 * no business moving.
 *
 * Spanish only, like the sweep: these are the tables it reads.
 */

const DIR = process.env.SWEEP_DIR;
const LEVELS = (process.env.SWEEP_LEVELS || '1,2,3,4,5,6').split(',').map(Number);
const ORDER = [1, 2, 3, 4, 5, 6];
const BAND_NAMES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const forms = ES_FORMS as Record<string, string>;
const dict = ESDICT as Record<string, { m?: string } | undefined>;
const index = buildLevelIndex(BANDS as unknown as LevelBands, ORDER);
const ungradeable = (form: string) => !dict[form]?.m && !forms[form];
const altKey = (t: PassageToken) => forms[(t.baseForm ?? t.text).trim().toLowerCase()];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

describe('sweep readability', () => {
  it('reports above-level share per level', () => {
    if (!DIR) throw new Error('set SWEEP_DIR to a directory holding level-<n>.json dumps');
    const out: string[] = [];
    const say = (line: string) => { out.push(line); console.log(line); };

    for (const level of LEVELS) {
      let dump: { passages?: unknown[] };
      try { dump = JSON.parse(readFileSync(`${DIR}/level-${level}.json`, 'utf8')); } catch { continue; }

      const above: number[] = [];
      const sizes: number[] = [];
      let pooledTokens = 0, pooledAbove = 0, pooledTypes = 0, skipped = 0;

      for (const raw of dump.passages ?? []) {
        const p = raw as { titleTokens?: PassageToken[]; sentences?: { tokens: PassageToken[] }[] };
        const tokens = [...(p.titleTokens ?? []), ...(p.sentences ?? []).flatMap(s => s.tokens)];
        const r = calculateReadability(tokens, index, level, ORDER, ungradeable, altKey);
        if (r.tokens < MIN_TOKENS) { skipped += 1; continue; }
        above.push(1 - r.coverage);
        sizes.push(r.tokens);
        pooledTokens += r.tokens;
        pooledAbove += r.tokens * (1 - r.coverage);
        pooledTypes += r.types;
      }

      if (above.length === 0) { say(`level ${level}: nothing measurable`); continue; }
      const sorted = [...sizes].sort((a, b) => a - b);
      say(`level ${level} (${BAND_NAMES[level - 1] ?? level})  n=${above.length} passages  `
        + `${pooledTokens} tokens  median ${sorted[Math.floor(sorted.length / 2)]}/passage`
        + (skipped ? `  (${skipped} too short to measure)` : ''));
      say(`   above level: pooled ${pct(pooledAbove / pooledTokens)}  `
        + `per-passage ${pct(mean(above))} ± ${pct(sd(above))}  `
        + `range ${pct(Math.min(...above))}–${pct(Math.max(...above))}`);
      say(`   ${(pooledTypes / pooledTokens).toFixed(2)} distinct forms per token`);
    }

    writeFileSync(`${DIR}/readability.txt`, `${out.join('\n')}\n`);
  });
});
