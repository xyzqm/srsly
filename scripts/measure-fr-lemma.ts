import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { buildLevelIndex, calculateReadability, type LevelBands } from '../lib/readability';
import type { PassageToken } from '../lib/types';
import type { RawTok } from '../lib/server/spanishSegmenter';
import { segmentFr } from '../lib/server/frenchSegmenter';
import { STARTER_TEXTS } from '../lib/data/starterTexts';
import LESSON_PRACTICE from '@data/lesson-practice.json';
import FR_LEVELS from '@data/fr-levels.json';
import FR_FORMS from '@data/fr-forms.json';
import FR_DICT from '@dict/frdict.json';

/**
 * IS THE FRENCH LEMMA CAP WORTH ~280 kB? MEASURED BEFORE BUILDING IT, ON TEXT ALREADY HERE.
 *
 * Spanish gained 1.0 point from capping an inflection by its lemma, and French is structurally
 * worse — 107 A1 words carry at least one inflection banded above A1, against Spanish's 64,
 * and `est` sits at A2 while `être` is A1. But a structural count is an upper bound on a
 * question nobody asked: what matters is how many such forms REACH the metric, and in Spanish
 * 83 structural became 18 actual tokens in 1879.
 *
 * Wiring French in means a new lazily-loaded form table (1.67 MB raw, ~280 kB over the wire),
 * and there is no French sweep to justify it — a sweep costs provider quota and an evening.
 * So this measures the real French prose the repository ALREADY contains: the starter texts
 * and the Learn tab's practice sentences, both run through the REAL segmenter, which is the
 * same thing `tests/starterTexts.test.ts` does and needs no key and no network.
 *
 * Not a test of anything. A measurement, kept so the number can be re-derived.
 *   npx vitest run --config scripts/measure-fr-lemma.vitest.mts
 */
const ORDER = [1, 2, 3, 4, 5, 6];
const index = buildLevelIndex(FR_LEVELS as unknown as LevelBands, ORDER);
const forms = FR_FORMS as unknown as Record<string, string>;
const dict = FR_DICT as unknown as Record<string, { m?: string } | undefined>;

const toToken = (t: RawTok): PassageToken =>
  t.length === 1 ? { text: t[0], type: 'punct' }
    : { text: t[0], reading: t[1] ?? '', meaning: t[2], baseForm: t[3], type: 'vocab' };

const ungradeable = (form: string) => !dict[form]?.m && !forms[form];
const lemmaKey = (t: PassageToken) => forms[(t.baseForm ?? t.text).trim().toLowerCase()];

describe('French lemma cap', () => {
  it('measures what it would be worth', () => {
    const texts: string[] = [];
    for (const s of (STARTER_TEXTS as Record<string, { text: string }[]>).fr ?? []) texts.push(s.text);
    const lp = (LESSON_PRACTICE as unknown as Record<string, Record<string, { text: string }[]>>).fr ?? {};
    for (const rows of Object.values(lp)) for (const r of rows) texts.push(r.text);

    const tokens = texts.flatMap(t => segmentFr(t, new Map()).map(toToken));
    const out: string[] = [];
    // vitest swallows stdout depending on how it is invoked — see analyse-sweep's header.
    const say = (m: string) => { out.push(m); console.log(m); };
    say(`French prose on hand: ${texts.length} passages/sentences, ${tokens.length} raw tokens`);

    for (const level of [1, 2]) {
      const off = calculateReadability(tokens, index, level, ORDER, ungradeable);
      const on  = calculateReadability(tokens, index, level, ORDER, ungradeable, undefined, lemmaKey);
      const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
      say(`  level ${level}: above level ${pct(1 - off.coverage)} → ${pct(1 - on.coverage)} `
        + `(cap worth ${pct(on.coverage - off.coverage)}, over ${off.tokens} measured tokens)`);
      const fixed = off.hardest.filter(h => !on.hardest.some(x => x.word === h.word));
      if (fixed.length) say(`    no longer hardest: ${fixed.map(h => h.word).join(' ')}`);
    }
    writeFileSync('/tmp/fr-lemma.txt', out.join('\n') + '\n');
  });
});
