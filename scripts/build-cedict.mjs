#!/usr/bin/env node
/**
 * Downloads CC-CEDICT and builds public/cedict.json
 * Run with: node scripts/build-cedict.mjs
 */
import { createGunzip } from 'zlib';
import { writeFile, mkdir } from 'fs/promises';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { isNameSense } from './lib/nameFilter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, '..', 'public', 'cedict.json');

const CEDICT_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';

// ─── Pinyin conversion (mirrors lib/pinyin.ts) ───────────────────────────────

const TONE_MAP = {
  a: ['a','ā','á','ǎ','à'],
  e: ['e','ē','é','ě','è'],
  i: ['i','ī','í','ǐ','ì'],
  o: ['o','ō','ó','ǒ','ò'],
  u: ['u','ū','ú','ǔ','ù'],
  v: ['ü','ǖ','ǘ','ǚ','ǜ'],
};

function toneNumToMark(s) {
  s = s.replace(/([a-zü]+)5/gi, '$1');
  s = s.replace(/([^a-z])v([1-4])/gi, '$1ü$2').replace(/^v([1-4])/gi, 'ü$1');
  s = s.replace(/([^a-zü])v(?![1-5a-z])/gi, '$1ü').replace(/^v(?![1-5a-z])/gi, 'ü');
  return s.replace(/([a-zü]+)([1-4])/gi, (_, syl, toneStr) => {
    const tone = parseInt(toneStr, 10);
    const lc = syl.toLowerCase();
    let targetIdx = -1;
    let which = '';
    for (const v of ['a', 'e']) {
      const idx = lc.indexOf(v);
      if (idx >= 0) { targetIdx = idx; which = v; break; }
    }
    if (targetIdx < 0) {
      if (lc.includes('ou')) { targetIdx = lc.indexOf('o'); which = 'o'; }
      else {
        for (let i = lc.length - 1; i >= 0; i--) {
          if ('iuvaeoü'.includes(lc[i])) {
            targetIdx = i;
            which = lc[i] === 'ü' ? 'v' : lc[i];
            break;
          }
        }
      }
    }
    if (targetIdx < 0 || !TONE_MAP[which]) return syl;
    const origChar = syl[targetIdx];
    const isCap = origChar === origChar.toUpperCase() && origChar !== origChar.toLowerCase();
    const marked = isCap ? TONE_MAP[which][tone].toUpperCase() : TONE_MAP[which][tone];
    return syl.slice(0, targetIdx) + marked + syl.slice(targetIdx + 1);
  });
}

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseLine(line) {
  if (line.startsWith('#') || !line.trim()) return null;
  // Format: Traditional Simplified [pin1 yin1] /def1/def2/...
  const m = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/);
  if (!m) return null;
  const [, , simplified, pinyinNum, defsStr] = m;
  const defs = defsStr.split('/').filter(d => d.trim());
  if (!defs.length) return null;
  // Normalise pinyin: space-separated syllables, u: → v for toneNumToMark
  const pinyinRaw = pinyinNum.toLowerCase().replace(/u:/g, 'v');
  // Convert each syllable
  // Hanyu Pinyin's syllable-dividing apostrophe: required before a syllable beginning with
  // a, o or e when it is not word-initial, because the boundary is otherwise ambiguous
  // (可爱 is kě'ài, not kěài; 西安 is xī'ān, not xīan). Mirrors joinPinyin in lib/pinyin.ts.
  // Decided from the NUMBERED syllable — plain ASCII — rather than the tone-marked output,
  // where the initial vowel could be any of fifteen accented forms.
  const pinyin = pinyinRaw.split(' ').reduce(
    (acc, syl, i) => acc + (i > 0 && /^[aoe]/.test(syl) ? "'" : '') + toneNumToMark(syl), '');
  // Take first definition, cap at 80 chars
  let meaning = defs[0].trim();
  if (meaning.length > 80) meaning = meaning.slice(0, 77) + '…';
  return { simplified, pinyin, meaning };
}

// ─── Download ────────────────────────────────────────────────────────────────

function fetch(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetch(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const gunzip = createGunzip();
      res.pipe(gunzip);
      gunzip.on('data', chunk => chunks.push(chunk));
      gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      gunzip.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60_000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── Variant resolution ──────────────────────────────────────────────────────
// CEDICT glosses like "old variant of 個|个[ge4]" carry no real meaning of their
// own. When the entire gloss is just such a pointer, swap in the target word's
// actual definition (following chains of variants, but not the pinyin).

const VARIANT_RE = /^(?:\([^)]*\)\s*)?(?:[A-Za-z]+\s+)*variant of\s+([^[\s]+)\[[^\]]+\]$/i;

function simplifiedForm(raw) {
  // CEDICT writes cross-references as "Traditional|Simplified" when they differ.
  return raw.includes('|') ? raw.split('|')[1] : raw;
}

function resolveVariants(dict) {
  let resolved = 0;
  for (const key of Object.keys(dict)) {
    const seen = new Set([key]);
    let cur = key;
    let entry = dict[cur];
    for (;;) {
      const m = VARIANT_RE.exec(entry.m);
      if (!m) break;
      const target = simplifiedForm(m[1]);
      if (seen.has(target) || !dict[target]) break;
      seen.add(target);
      cur = target;
      entry = dict[cur];
    }
    if (cur !== key && !VARIANT_RE.test(entry.m)) {
      dict[key] = { p: dict[key].p, m: entry.m };
      resolved++;
    }
  }
  return resolved;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Downloading CC-CEDICT from', CEDICT_URL, '...');
  const text = await fetch(CEDICT_URL);
  const lines = text.split('\n');
  console.log(`Parsing ${lines.length.toLocaleString()} lines...`);

  /** True when EVERY sense of a gloss only names a person or place, so it defines nothing. */
  const isNameOnly = gloss =>
    String(gloss || '').split(/[;/]/).map(x => x.trim()).filter(Boolean).every(isNameSense);

  const dict = {};
  let skipped = 0;
  for (const line of lines) {
    const entry = parseLine(line);
    if (!entry) { skipped++; continue; }
    // Keep first entry per simplified form, but prefer a REAL definition over two kinds of
    // entry that carry none.
    //
    // A "variant of" pointer loses to a later entry with a real definition — otherwise
    // resolveVariants() below cannot tell a genuine circular reference apart from a
    // same-key self-reference caused by this dedup discarding the target.
    //
    // A NAME-ONLY entry loses the same way, and that one was silently deleting core
    // vocabulary. The old comment claimed cedict's order puts the commonest sense first;
    // it does not for surnames, because capitalised surname pinyin (`Mǎ`) sorts ahead of
    // the lowercase reading (`mǎ`). So 马 was "surname Ma" with no "horse" anywhere, 能 was
    // "surname Neng" rather than "can, be able to", and 张 — the measure word for flat
    // things — was "surname Zhang". Seven of the 597 words in HSK 1–3 were affected, and
    // gloss collapsing made the wrong sense the only one shown.
    const existing = dict[entry.simplified];
    const replaces = !existing
      || (VARIANT_RE.test(existing.m) && !VARIANT_RE.test(entry.meaning))
      || (isNameOnly(existing.m) && !isNameOnly(entry.meaning));
    if (replaces) {
      dict[entry.simplified] = { p: entry.pinyin, m: entry.meaning };
    }
  }

  const count = Object.keys(dict).length;
  console.log(`  ${count.toLocaleString()} entries, ${skipped.toLocaleString()} skipped`);

  const resolved = resolveVariants(dict);
  console.log(`  ${resolved.toLocaleString()} "variant of" glosses resolved to their target's definition`);

  const json = JSON.stringify(dict);
  await writeFile(OUTPUT, json, 'utf8');
  const kb = Math.round(json.length / 1024);
  console.log(`Wrote ${OUTPUT} (${kb} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
