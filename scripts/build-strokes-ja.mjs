/**
 * Japanese stroke data — the Chinese build's sibling, and a DIFFERENT SOURCE on purpose.
 *
 * ## WHY THIS COULD NOT JUST REUSE `public/strokes/`
 *
 * CLAUDE.md recorded handwriting as Chinese-only for two measured reasons, and both are about
 * data honesty rather than scope. Both were re-measured before this script was written, and
 * both are ANSWERED by this source rather than argued away:
 *
 * 1. **223 JLPT kanji are absent from `hanzi-writer-data`**, all of them shinjitai. Sampled
 *    against this source: 厳 倹 権 鉱 渉 沢 団 読 売 楽 児 発 are all present, with medians.
 * 2. **Characters that DO exist can carry the wrong stroke order or shape for Japanese.**
 *    Compared file against file: 骨 is **10 strokes here against 9 in the Chinese set** — a
 *    whole stroke, not a rounding difference — and 直, 令 and 画 share a stroke count while
 *    differing in every path. So this is genuinely Japanese data and not the Chinese set
 *    rebadged, which is the thing that had to be true before shipping any of it.
 *
 * ## THE SOURCE, AND THE ONE THING THAT IS ODD ABOUT IT
 *
 * `hanzi-writer-data-jp`, which derives from **animCJK** (François Mizessyn), which derives
 * from **Makemeahanzi**. It arrives in `HanziWriter`'s own `{ strokes, medians }` shape, so
 * nothing is converted here — this script SUBSETS and vendors, exactly as `build-strokes.mjs`
 * does for Chinese.
 *
 * **The npm TARBALL contains no character data** — twelve files, all licences and scaffolding,
 * because the data is a git submodule npm does not ship. CLAUDE.md said so and was right. What
 * it did not know is that **the jsDelivr CDN serves the files anyway**, which is what makes
 * this buildable at all. Odder still: `@0` serves them and the identical `@0.0.2` returns 404,
 * though jsDelivr's own resolver maps `@0` to 0.0.2. That is a CDN quirk rather than a version
 * difference, and it is the one fragile thing here — so this script FETCHES ONCE AND VENDORS.
 * If the quirk ever goes, this build fails loudly and the committed data keeps working; no
 * learner ever depends on the CDN, which is the same rule `strokeDataUrl` already states.
 *
 * ## KNOWN LIMITS OF THIS DATA, stated rather than discovered later
 *
 * Its own README names two: no radical data (so no `radStrokes`, which the Chinese files carry
 * and the quiz does not need), and no capped strokes, so strokes meet at sharp corners rather
 * than rounded ones. Both are cosmetic next to teaching the wrong stroke order.
 *
 * ## LICENCE
 *
 * LGPL-3.0-or-later (animCJK) AND the Arphic Public License (the glyph data it derives from).
 * Both texts are copied next to the data, and `MODIFICATIONS.txt` records the subsetting, for
 * the same reason `build-strokes.mjs` does it: subsetting DELETES characters from the table,
 * which APL §2a calls a modification that must be stated.
 *
 *   node scripts/build-strokes-ja.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'strokes-ja');
const JLPT_VOCAB = path.join(ROOT, 'lib', 'data', 'jlpt-vocab.json');

/** `@0` rather than `@0.0.2`: see the note above — only this form serves the data. */
const BASE = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data-jp@0';
const CONCURRENCY = 12;
const HAN = /[一-鿿㐀-䶿]/;

/** Every kanji the app could ask a Japanese learner to draw: the distinct Han characters in
 *  the JLPT vocabulary, derived the same way `build-strokes.mjs` derives HSK's 2,663. */
function jlptKanji() {
  const vocab = JSON.parse(fs.readFileSync(JLPT_VOCAB, 'utf8'));
  const chars = new Set();
  for (const word of Object.keys(vocab)) {
    for (const ch of word) if (HAN.test(ch)) chars.add(ch);
  }
  return [...chars].sort();
}

/** A file is only written when it is SHAPED like stroke data. A 404 page or a truncated body
 *  that parses as JSON would otherwise be saved and fail at the drawing surface instead. */
function usable(d) {
  return d && Array.isArray(d.strokes) && Array.isArray(d.medians)
    && d.strokes.length > 0 && d.strokes.length === d.medians.length;
}

async function fetchChar(ch) {
  const url = `${BASE}/${encodeURIComponent(ch)}.json`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;         // genuinely absent — not worth a retry
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return usable(data) ? data : null;
    } catch {
      if (attempt === 1) return undefined;          // a FAILURE, distinct from "not there"
    }
  }
  return undefined;
}

async function main() {
  const chars = jlptKanji();
  fs.mkdirSync(OUT, { recursive: true });

  const missing = [];
  const failed = [];
  let written = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < chars.length) {
      const ch = chars[cursor++];
      const data = await fetchChar(ch);
      if (data === undefined) { failed.push(ch); continue; }
      if (data === null) { missing.push(ch); continue; }
      fs.writeFileSync(path.join(OUT, `${ch}.json`), JSON.stringify(data));
      written++;
      if (written % 200 === 0) console.log(`  …${written} written`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // ── Licence obligations, copied next to the data they cover ────────────────
  const pkgLicenses = path.join(ROOT, 'node_modules', 'hanzi-writer-data-jp', 'licenses');
  const notes = [
    'MODIFICATIONS to the animCJK / Arphic stroke data',
    '',
    `Generated by scripts/build-strokes-ja.mjs on ${new Date().toISOString().slice(0, 10)}.`,
    '',
    'WHAT WAS CHANGED: nothing inside any character file. The upstream set was SUBSET —',
    `this copy retains the ${written} characters that appear in the JLPT vocabulary lists,`,
    'which are the only characters srsly can ask a Japanese learner to draw. Every other',
    'character was omitted. Coordinates, stroke order and medians are byte-for-byte upstream.',
    '',
    'Source: hanzi-writer-data-jp (https://www.npmjs.com/package/hanzi-writer-data-jp),',
    'derived from animCJK (https://github.com/parsimonhi/animCJK), Copyright 2016-2019',
    'Francois Mizessyn, itself derived from Makemeahanzi',
    '(https://github.com/skishore/makemeahanzi).',
    '',
    'Licensed under the GNU LGPL v3 or later, and the Arphic Public License for the glyph',
    'data. Both licence texts accompany this file.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'MODIFICATIONS.txt'), notes);
  for (const f of ['LGPL.txt', 'COPYING.txt', 'ARPHICPL.TXT']) {
    const src = path.join(pkgLicenses, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, f));
    else console.warn(`  ! licence file not found and NOT copied: ${f}`);
  }

  const pct = (written / chars.length * 100).toFixed(1);
  console.log(
    `\nWrote ${written}/${chars.length} JLPT kanji to public/strokes-ja/ (${pct}%).`,
  );
  if (missing.length) {
    console.log(`Absent upstream (${missing.length}): ${missing.slice(0, 40).join('')}${missing.length > 40 ? '…' : ''}`);
    fs.writeFileSync(path.join(OUT, 'MISSING.txt'), missing.join('\n') + '\n');
  }
  if (failed.length) {
    console.log(`\n⚠ ${failed.length} FETCH FAILURES (network, not absence): ${failed.slice(0, 20).join('')}`);
    console.log('  Re-run; the script overwrites and is safe to repeat.');
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
