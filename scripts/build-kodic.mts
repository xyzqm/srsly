#!/usr/bin/env npx tsx
/**
 * Builds the Korean language data from public open-source datasets:
 *
 *   public/kodict.json        — { surface: { p: "", m: meaning } }
 *                               the Korean analogue of cedict/jmdict/esdict.json.
 *                               `p` (the reading slot) is ALWAYS "" — Hangul is phonetic.
 *   lib/data/topik-vocab.ts   — TOPIK_VOCAB: headword → { reading: '', meaning }
 *   lib/data/topik-levels.ts  — TOPIK_LEVELS: level(1–6) → headword[]  (1 = easiest)
 *
 * Sources:
 *   - Korean Wiktionary extract via kaikki.org (CC BY-SA 4.0) — definitions.
 *   - Word frequencies via hermitdave/FrequencyWords, from the OpenSubtitles 2018
 *     corpus (CC BY-SA 4.0).
 *
 * !! TOPIK CAVEAT !!
 * TOPIK publishes no official vocabulary list, exactly as the CEFR does not (see
 * lib/data/cefr-levels.ts). The best-graded open data available — a scrape combining the
 * National Institute of Korean Language's 초급/중급 grading with a TOPIK A/B/C grading —
 * carries no license, so it is deliberately NOT used here. The 1–6 bands below are a
 * FREQUENCY APPROXIMATION: headwords ranked by corpus frequency and cut at the cumulative
 * vocabulary sizes commonly cited per TOPIK level. A usable study progression, not an
 * authoritative mapping.
 *
 * WHY THIS SCRIPT RUNS THE LEMMATIZER
 * Korean is agglutinative, so a raw frequency list is mostly inflected forms — its top
 * entries are 내가 (나+가), 난, 있어, 거야, 할 — not dictionary words. Banding it directly
 * would produce a "vocabulary list" of conjugated fragments. So every token is run through
 * the REAL runtime lemmatizer and its count aggregated onto the resolved headword. That
 * also makes this script the lemmatizer's acceptance test: it reports coverage over all
 * 50k tokens at the end, which is the honest measure of how well the rules actually work.
 *
 * Run with: npx tsx scripts/build-kodic.mts
 * Requires `curl` on PATH (same network assumption as the other build scripts).
 */
import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { lemmatizeKo, type LemmaDict } from '../lib/server/koreanLemmatizer.ts';
import { emitData } from './lib/emitData.mjs';
import { isNameSense } from './lib/nameFilter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const KAIKKI_URL = 'https://kaikki.org/dictionary/Korean/kaikki.org-dictionary-Korean.jsonl';
const FREQ_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ko/ko_50k.txt';

/** Cumulative headword counts per TOPIK level — the vocabulary sizes commonly cited for
 *  each level. Bands are cut from the frequency ranking at these offsets. */
const TOPIK_BANDS = [
  { level: 1, upTo: 800 },
  { level: 2, upTo: 1800 },
  { level: 3, upTo: 3200 },
  { level: 4, upTo: 5200 },
  { level: 5, upTo: 8000 },
  { level: 6, upTo: 12000 },
];

const MAX_MEANING = 90;
const MAX_SENSES = 3;

/** Senses that mark a headword as non-core; kept, but always ranked below plain ones. */
const RESTRICTED_TAGS = new Set([
  'obsolete', 'archaic', 'rare', 'dated', 'historical', 'poetic', 'literary',
  'slang', 'vulgar', 'derogatory', 'offensive', 'colloquial', 'informal',
  'dialectal', 'regional', 'nonstandard', 'humorous', 'euphemistic',
]);

/** Parts of speech that are real vocabulary. Excludes hanja characters, bare syllables,
 *  particles and affixes, none of which belong on a flashcard. */
const CONTENT_POS = new Set(['noun', 'verb', 'adj', 'adv', 'num', 'pron', 'det', 'intj', 'phrase', 'proverb']);

/** Hangul-only words (plus internal spaces for multi-word entries). Filters out the large
 *  hanja portion of the Korean Wiktionary, which is not what a learner studies. */
const HANGUL_RE = /^[가-힣]+(?: [가-힣]+)*$/;

function curlStream(url: string) {
  return spawn('curl', ['-sL', '--max-time', '900', url], { stdio: ['ignore', 'pipe', 'inherit'] });
}

async function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('curl', ['-sL', '--max-time', '180', url], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', c => { out += c; });
    proc.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`curl exited ${code} for ${url}`))));
  });
}

/** Trim Wiktionary's parenthetical/encyclopedic detail down to a flashcard-sized gloss. */
function cleanGloss(g: string): string {
  let s = String(g).replace(/\s+/g, ' ').replace(/^\((?:[^)]*)\)\s*/, '').trim();
  if (s.length <= MAX_MEANING) return s;
  const head = s.split(' (')[0].trim();
  if (head.length >= 3) { if (head.length <= MAX_MEANING) return head; s = head; }
  if (s.length <= MAX_MEANING) return s;
  let cut = s.slice(0, MAX_MEANING + 1).replace(/\s+\S*$/, '').trim();
  const clause = cut.replace(/[,;:]\s[^,;:]*$/, '').trim();
  if (clause.length >= 12) cut = clause;
  const open = (cut.match(/\(/g) ?? []).length;
  const close = (cut.match(/\)/g) ?? []).length;
  if (open > close) cut = cut.slice(0, cut.lastIndexOf('(')).trim();
  return cut.replace(/[,;:]$/, '').trim();
}

interface Candidate { gloss: string; restricted: boolean; order: number }

async function main() {
  // ── 1. Frequency list ──────────────────────────────────────────────────────
  console.log('Downloading frequency list from', FREQ_URL, '...');
  const freqText = await fetchText(FREQ_URL);
  /** surface → corpus count, in rank order */
  const freq: Array<[string, number]> = [];
  for (const line of freqText.split('\n')) {
    const [word, count] = line.trim().split(' ');
    if (!word || !/^[가-힣]+$/.test(word)) continue;
    freq.push([word, parseInt(count, 10) || 1]);
  }
  console.log(`  ${freq.length} ranked surface forms`);

  // ── 2. Stream the Wiktionary extract ───────────────────────────────────────
  console.log('Streaming Wiktionary extract from', KAIKKI_URL, '(~195 MB) ...');
  const senses = new Map<string, Candidate[]>();
  let senseOrder = 0;

  const proc = curlStream(KAIKKI_URL);
  const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });

  let lines = 0;
  for await (const line of rl) {
    if (!line) continue;
    if (++lines % 250_000 === 0) console.log(`  ${lines.toLocaleString()} lines…`);
    let e: Record<string, unknown>;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.lang_code !== 'ko' || typeof e.word !== 'string') continue;
    const word = (e.word as string).trim();
    if (!word || !HANGUL_RE.test(word)) continue;
    if (!CONTENT_POS.has(e.pos as string)) continue;

    for (const s of (e.senses ?? []) as Array<Record<string, unknown>>) {
      // Korean form-of entries are overwhelmingly hanja→hangul spellings, not inflections,
      // so they carry no lemmatization value and are simply skipped.
      if (s.form_of) continue;
      const g = ((s.glosses ?? []) as string[])[0];
      if (!g) continue;
      const clean = cleanGloss(g);
      if (!clean) continue;
      if (/^(alternative|hanja|synonym) (form|spelling) of /i.test(clean)) continue;
      // Per-sense name filter, matching es/fr. CONTENT_POS above already drops pos:'name'.
      if (isNameSense(clean)) continue;
      // Korean Wiktionary also lists many CONJUGATED forms as headwords in their own right,
      // glossed as e.g. "informal polite declarative of 모르다". Those are not vocabulary —
      // and worse, keeping them makes the lemmatizer stop at 몰라요 instead of resolving it
      // to 모르다, because its first test is "is this surface already a headword?".
      if (/\b(declarative|interrogative|imperative|propositive|conjunctive|adnominal|sequential|infinitive|nominal|honorific)\b[^.]*\bof\b/i.test(clean)) continue;
      if (/^(informal|formal|polite|plain|intimate|casual)\b[^.]*\bof\b/i.test(clean)) continue;
      const tags = (s.tags ?? []) as string[];
      const restricted = tags.some(t => RESTRICTED_TAGS.has(t)) || tags.some(t => /^[A-Z]/.test(t));
      if (!senses.has(word)) senses.set(word, []);
      senses.get(word)!.push({ gloss: clean, restricted, order: senseOrder++ });
    }
  }
  await new Promise(res => proc.on('close', res));
  console.log(`  parsed ${lines.toLocaleString()} lines → ${senses.size} headwords`);

  // ── 3. kodict.json ─────────────────────────────────────────────────────────
  const dictOut: Record<string, { p: string; m: string }> = {};
  for (const [word, cands] of senses) {
    const ranked = cands
      .sort((a, b) => (a.restricted === b.restricted ? a.order - b.order : a.restricted ? 1 : -1))
      .map(c => c.gloss);
    const m = [...new Set(ranked)].slice(0, MAX_SENSES).join('; ');
    if (m) dictOut[word] = { p: '', m };
  }
  const dictPath = path.join(ROOT, 'public', 'kodict.json');
  await writeFile(dictPath, JSON.stringify(dictOut));
  console.log(`Wrote ${dictPath} (${Object.keys(dictOut).length} entries)`);

  // ── 4. Lemmatize the frequency list (the lemmatizer's acceptance test) ─────
  // Uses the exact runtime rules, against the dictionary just built.
  const NAME_SENSE_RE = /\b(surname|given name|patronymic)\b|^an? [a-z ]*\b(city|town|village|county|province|district|river|island|dynasty)\b/i;
  const dict: LemmaDict = {
    has: (w) => w in dictOut,
    isCommonWord: (w) => {
      const m = dictOut[w]?.m;
      if (!m) return false;
      return m.split('; ').some(s => s.trim() && !NAME_SENSE_RE.test(s.trim()));
    },
  };

  console.log('Lemmatizing the frequency list …');
  /** headword → aggregated corpus count */
  const lemmaFreq = new Map<string, number>();
  let direct = 0, viaLemma = 0, unresolved = 0;
  for (const [surface, count] of freq) {
    let head: string | undefined;
    if (dict.has(surface)) { head = surface; direct++; }
    else {
      const lemma = lemmatizeKo(surface, dict);
      if (lemma && dict.has(lemma)) { head = lemma; viaLemma++; }
      else unresolved++;
    }
    if (head) lemmaFreq.set(head, (lemmaFreq.get(head) ?? 0) + count);
  }
  const resolved = direct + viaLemma;
  const pct = (n: number) => `${((n / freq.length) * 100).toFixed(1)}%`;
  console.log(`  ${freq.length} tokens → ${resolved} resolved (${pct(resolved)})`);
  console.log(`    already a headword: ${direct} (${pct(direct)})`);
  console.log(`    resolved by lemmatizer: ${viaLemma} (${pct(viaLemma)})`);
  console.log(`    unresolved: ${unresolved} (${pct(unresolved)})`);
  console.log(`  → ${lemmaFreq.size} distinct headwords carry corpus frequency`);

  // ── 5. TOPIK bands (frequency approximation — see the header caveat) ───────
  const ranked = [...lemmaFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .filter(w => dict.isCommonWord(w));

  // The cutoffs above assume ~12k ranked headwords. Korean yields fewer (the corpus is
  // colloquial and much of it is names, interjections and inflections we cannot resolve),
  // so scale the bands to the vocabulary actually available. Without this the top level
  // ends up a stub of whatever is left over rather than a real band.
  const topCutoff = TOPIK_BANDS[TOPIK_BANDS.length - 1].upTo;
  const scale = Math.min(1, ranked.length / topCutoff);
  if (scale < 1) {
    console.log(`  only ${ranked.length} ranked headwords available — scaling bands by ${scale.toFixed(2)}`);
  }

  const levels: Record<number, string[]> = {};
  const vocab: Record<string, { reading: string; meaning: string }> = {};
  let cursor = 0;
  for (const { level, upTo } of TOPIK_BANDS) {
    const end = Math.round(upTo * scale);
    const slice = ranked.slice(cursor, end);
    cursor = end;
    levels[level] = slice;
    for (const w of slice) vocab[w] = { reading: '', meaning: dictOut[w].m };
  }

  const levelsPath = path.join(ROOT, 'lib', 'data', 'topik-levels.ts');
  await emitData(levelsPath, 'TOPIK_LEVELS', 'Record<number, string[]>', levels, `// Auto-generated by scripts/build-kodic.mts — DO NOT EDIT BY HAND.
// Maps TOPIK level (1 = easiest … 6 = hardest) to its word list.
// TOPIK I covers levels 1–2; TOPIK II covers 3–6.
//
// NOTE: unlike HSK_LEVELS and JLPT_LEVELS, which come from official published exam word
// lists, TOPIK publishes no such list — the same situation as CEFR_LEVELS. These bands are
// a FREQUENCY APPROXIMATION: headwords ranked by OpenSubtitles corpus frequency (after
// lemmatizing the corpus, since Korean surface forms are overwhelmingly inflected) and cut
// at the cumulative vocabulary sizes commonly cited per level. Useful as a study
// progression, not authoritative.`);
  console.log(`Wrote ${levelsPath} (${TOPIK_BANDS.map(b => `L${b.level}:${levels[b.level].length}`).join(' ')})`);

  const vocabPath = path.join(ROOT, 'lib', 'data', 'topik-vocab.ts');
  await emitData(vocabPath, 'TOPIK_VOCAB', 'Record<string, { reading: string; meaning: string }>', vocab, `// Auto-generated by scripts/build-kodic.mts — DO NOT EDIT BY HAND.
// TOPIK 1–6 vocabulary (source: Korean Wiktionary glosses, banded by OpenSubtitles
// frequency — see the caveat in topik-levels.ts about these bands being approximate).
// 'reading' exists only to match the shape of HSK_VOCAB / JLPT_VOCAB / CEFR_VOCAB and is
// always '' for Korean: Hangul is phonetic and needs no separate reading line.`);
  console.log(`Wrote ${vocabPath} (${Object.keys(vocab).length} entries)`);
}

main().catch(err => { console.error(err); process.exit(1); });
