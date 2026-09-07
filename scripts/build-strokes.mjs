#!/usr/bin/env node
/**
 * Downloads hanzi-writer-data and builds public/strokes/ — stroke outlines for handwriting
 * practice. Run with: node scripts/build-strokes.mjs
 *
 * Source:  hanzi-writer-data, the character data behind Hanzi Writer, itself derived from
 *          the Make Me a Hanzi project and ultimately from Arphic's TrueType fonts.
 *          https://github.com/chanind/hanzi-writer-data
 * Licence: ARPHIC PUBLIC LICENSE. Copied verbatim to public/strokes/ARPHICPL.TXT, which is
 *          what §1 requires of anyone redistributing it.
 *
 * ── WHY THIS IS A SUBSET, AND WHY THAT NEEDS SAYING OUT LOUD ──
 * The upstream set is 9,574 characters and 47 MB. srsly only ever draws HSK 1–6, which is
 * 2,663 of them, so shipping the rest would be 40 MB of files no learner here can reach.
 * Deleting characters from the glyph table is explicitly a MODIFICATION under APL §2, which
 * asks for two things: a notice saying what changed and when (public/strokes/MODIFICATIONS.txt,
 * written below) and that the modification be freely available under the same terms (this
 * repository is public, and this script reproduces the subset exactly).
 *
 * Nothing INSIDE a character file is touched. The outlines, medians and radical markers are
 * copied byte for byte — rounding coordinates to save space would be a deeper modification of
 * the glyph data for a few hundred kB, and the point of the licence is that the shapes stay
 * traceable to Arphic.
 *
 * ── ONE FILE PER CHARACTER, NOT ONE BUNDLE ──
 * Every other dataset here is a single JSON fetched whole, because lookups are arbitrary — you
 * cannot know which dictionary entries a passage needs. Stroke data is the opposite: a session
 * practises a handful of characters and needs those and no others. Measured: ~2.4 kB each, so a
 * 20-character session costs ~48 kB, against 1.41 MB to fetch even a level-3 shard and 7.00 MB
 * for the lot. It is also the shape `HanziWriter`'s own `charDataLoader` expects.
 *
 * The cost is 2,663 files in the repository, which is the honest trade: the bytes are identical
 * either way, and only the file count is worse.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'strokes');
const HSK_LEVELS = path.join(ROOT, 'lib', 'data', 'hsk-levels.json');

/** Pinned, so a rerun reproduces the same subset rather than whatever npm serves today. */
const PACKAGE = 'hanzi-writer-data@2.0.1';

const HAN = /[一-鿿]/;

/**
 * Fetch and unpack the upstream data through `npm pack`.
 *
 * Deliberately not a hand-rolled registry URL plus a tar parser: `npm pack` already resolves
 * the version, verifies the integrity hash and hands back a tarball, and `tar` is on every
 * machine this runs on. The alternative — 2,663 individual CDN requests — is slower and fails
 * in 2,663 different ways.
 */
function fetchUpstream() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srsly-strokes-'));
  process.stdout.write(`Downloading ${PACKAGE}…\n`);
  const out = execFileSync('npm', ['pack', PACKAGE, '--silent'], { cwd: tmp, encoding: 'utf8' });
  const tgz = out.trim().split('\n').pop();
  execFileSync('tar', ['-xzf', tgz], { cwd: tmp });
  return { dir: path.join(tmp, 'package'), tmp };
}

function hskCharacters() {
  const levels = JSON.parse(fs.readFileSync(HSK_LEVELS, 'utf8'));
  const chars = new Set();
  for (const level of Object.keys(levels)) {
    for (const word of levels[level]) {
      for (const ch of word) if (HAN.test(ch)) chars.add(ch);
    }
  }
  return chars;
}

function main() {
  const { dir, tmp } = fetchUpstream();
  const chars = [...hskCharacters()].sort();

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  let bytes = 0;
  const missing = [];
  for (const ch of chars) {
    const src = path.join(dir, `${ch}.json`);
    if (!fs.existsSync(src)) { missing.push(ch); continue; }
    const data = fs.readFileSync(src);
    fs.writeFileSync(path.join(OUT, `${ch}.json`), data);
    bytes += data.length;
  }

  // APL §1: the licence travels with the data, unaltered, in every copy.
  fs.copyFileSync(path.join(dir, 'ARPHICPL.TXT'), path.join(OUT, 'ARPHICPL.TXT'));

  // APL §2(a): say what was changed, and when.
  fs.writeFileSync(path.join(OUT, 'MODIFICATIONS.txt'), [
    'Modifications to hanzi-writer-data, as required by ARPHIC PUBLIC LICENSE section 2(a).',
    '',
    `Source:   ${PACKAGE}`,
    `Modified: ${new Date().toISOString().slice(0, 10)} by scripts/build-strokes.mjs`,
    '',
    'What changed:',
    '',
    `  Characters were DELETED from the glyph table. The upstream package contains stroke`,
    `  data for 9,574 characters; this copy retains the ${chars.length - missing.length} that`,
    `  appear in the HSK 1-6 vocabulary lists, which are the only characters srsly can ask a`,
    `  learner to write. No other change was made.`,
    '',
    '  The contents of each retained character file are byte-for-byte identical to upstream.',
    '  No outline, median or radical marker was altered, rounded or recomputed.',
    '',
    'Reproducing this subset:',
    '',
    '  node scripts/build-strokes.mjs',
    '',
    'The full upstream data remains freely available under the same licence at',
    'https://github.com/chanind/hanzi-writer-data and on npm as hanzi-writer-data.',
    '',
  ].join('\n'));

  fs.rmSync(tmp, { recursive: true, force: true });

  const written = chars.length - missing.length;
  process.stdout.write(
    `Wrote ${written}/${chars.length} HSK characters to public/strokes/ ` +
    `(${(bytes / 1048576).toFixed(2)} MB)\n`,
  );
  if (missing.length) {
    // Loud rather than fatal: a handful of gaps is survivable (the UI falls back to showing
    // the character without a stroke animation), but a silent gap would be discovered by a
    // learner tapping Write on a card and getting nothing.
    process.stdout.write(`WARNING: no stroke data for ${missing.length}: ${missing.join('')}\n`);
  }
}

main();
