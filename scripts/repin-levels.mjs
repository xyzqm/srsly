#!/usr/bin/env node
/**
 * Re-apply `core-overrides.json` to the ALREADY-EMITTED level tables, with no rebuild.
 *
 *   node scripts/repin-levels.mjs es
 *
 * ── WHY THIS EXISTS, AND WHEN IT IS THE WRONG TOOL ──
 *
 * Adding a word to `pin` or `beginner` is a one-line edit whose only effect is to move that
 * word to level 1. The full `build-esdict.mjs` would apply it — and would also re-download the
 * corpora and re-derive every frequency and every CEFR-J anchor swap from whatever those
 * sources say TODAY. CLAUDE.md measures the anchor alone as moving ~3-4% of the vocabulary, so
 * a six-word fix would arrive inside a few-hundred-word diff, and any before/after measurement
 * of those six words would be measuring the other few hundred as well.
 *
 * This is not a second implementation of the override logic. It calls the SAME
 * `applyCoreOverrides` the build calls, on the same `Record<band, words[]>` shape, at the same
 * point in the pipeline — the build applies it last, after the anchor and immediately before
 * emission, so running it against the emitted table is the identical operation. A later full
 * rebuild reads the same `core-overrides.json` and reproduces the same pins; this does not
 * become a fact that lives only in an output file.
 *
 * ── IT IS THE WRONG TOOL FOR ANYTHING ELSE ──
 *
 * `demote`, `leadSense`, `curatedGloss` and every frequency or band-size question are decided
 * EARLIER in the build, so they cannot be reached from here. So can a word that is not already
 * in the emitted tables: `cefr-vocab.json` carries the gloss for every banded word, and this
 * cannot invent one, so an unranked word is reported and skipped rather than pinned without a
 * definition. Both of those mean a full rebuild.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyCoreOverrides, reportCoreOverrides } from './lib/coreOverrides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANG = process.argv[2] || 'es';
const TABLES = {
  es: { levels: 'cefr-levels.json', vocab: 'cefr-vocab.json', dict: 'esdict.json' },
  fr: { levels: 'fr-levels.json', vocab: 'fr-vocab.json', dict: 'frdict.json' },
};
const T = TABLES[LANG];
if (!T) { console.error(`lang must be one of ${Object.keys(TABLES).join(', ')}`); process.exit(1); }

const levelsPath = path.join(ROOT, 'lib', 'data', T.levels);
const levels = JSON.parse(readFileSync(levelsPath, 'utf8'));
const vocab = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'data', T.vocab), 'utf8'));

const before = JSON.stringify(levels);
const sizeBefore = levels[1].length;
/**
 * A word counts as "in the dictionary" only if the EMITTED vocab carries it, which is stricter
 * than the build's own test and has to be: the build can look a gloss up and add one, and this
 * cannot. A pinned word with no entry in `cefr-vocab.json` would appear in level 1 with no
 * definition at all — the strict-dictionary rule broken in the one place nobody would look.
 */
const result = applyCoreOverrides(LANG, levels, w => Object.hasOwn(vocab, w));
reportCoreOverrides(result, sizeBefore);

const after = JSON.stringify(result.levels);
if (after === before) { console.log('  no change — the emitted table already matches.'); process.exit(0); }
writeFileSync(levelsPath, `${after}\n`);
console.log(`  wrote ${path.relative(ROOT, levelsPath)}`);
