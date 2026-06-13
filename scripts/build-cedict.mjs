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
  const pinyin = pinyinRaw.split(' ').map(s => toneNumToMark(s)).join('');
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Downloading CC-CEDICT from', CEDICT_URL, '...');
  const text = await fetch(CEDICT_URL);
  const lines = text.split('\n');
  console.log(`Parsing ${lines.length.toLocaleString()} lines...`);

  const dict = {};
  let skipped = 0;
  for (const line of lines) {
    const entry = parseLine(line);
    if (!entry) { skipped++; continue; }
    // Keep first entry per simplified form (alphabetical order in cedict = most common first)
    if (!dict[entry.simplified]) {
      dict[entry.simplified] = { p: entry.pinyin, m: entry.meaning };
    }
  }

  const count = Object.keys(dict).length;
  console.log(`  ${count.toLocaleString()} entries, ${skipped.toLocaleString()} skipped`);

  const json = JSON.stringify(dict);
  await writeFile(OUTPUT, json, 'utf8');
  const kb = Math.round(json.length / 1024);
  console.log(`Wrote ${OUTPUT} (${kb} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
