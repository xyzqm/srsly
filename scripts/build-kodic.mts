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
 *   - Word frequencies blended across three registers — Tatoeba (everyday), Global Voices
 *     (news) and Wikimedia (reference) — by scripts/lib/corpusFreq.mjs. NOT subtitles: see
 *     that file for why one register of film dialogue made bad study lists.
 *
 * !! TOPIK CAVEAT !!
 * TOPIK publishes no official vocabulary list, exactly as the CEFR does not (see
 * lib/data/cefr-levels.ts). The best-graded open data available — a scrape combining the
 * National Institute of Korean Language's 초급/중급 grading with a TOPIK A/B/C grading —
 * carries no license, so it is deliberately NOT used here. The 1–6 bands below are a
 * FREQUENCY APPROXIMATION: headwords ranked by cross-register corpus frequency and cut at
 * the cumulative vocabulary sizes commonly cited per TOPIK level. A usable study
 * progression, not an authoritative mapping. Korean gets no CEFR-style graded resource
 * either: CEFRLex covers six European languages and none of them is Korean.
 *
 * WHY THIS SCRIPT RUNS THE LEMMATIZER
 * Korean is agglutinative, so raw corpus counts are mostly of inflected forms — 내가 (나+가),
 * 난, 있어, 할 — not dictionary words. Banding them directly would produce a "vocabulary
 * list" of conjugated fragments. So every surface is run through the REAL runtime
 * lemmatizer and its score aggregated onto the resolved headword. That also makes this
 * script the lemmatizer's acceptance test: it reports coverage over every surface the
 * corpora yielded, which is the honest measure of how well the rules actually work.
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
import { blendedFrequency, adjustBandsWithAnchor } from './lib/corpusFreq.mjs';
import { anchorLevelOf, writeAnchorReport } from './lib/cefrjAnchor.mjs';
import { isNonStandardSense, isExcludedHeadword, isMetalinguisticGloss } from './lib/registerFilter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const KAIKKI_URL = 'https://kaikki.org/dictionary/Korean/kaikki.org-dictionary-Korean.jsonl';

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

interface Candidate { gloss: string; restricted: boolean; excluded: boolean; order: number }

async function main() {
  // ── 1. Cross-register frequency ────────────────────────────────────────────
  // Replaces the old single OpenSubtitles list. A surface must clear the count threshold in
  // at least two of the three registers to be scored — see scripts/lib/corpusFreq.mjs.
  const { score } = await blendedFrequency('ko', /[가-힣]+/g);
  // `score` is a mean rank, so LOWER is better. Carry each surface as reciprocal-rank
  // weight instead, because the step below aggregates several inflected surfaces onto one
  // headword and ranks do not add — 먹었어요 and 먹습니다 both landing at rank 400 should
  // make 먹다 stronger than either, which summing 1/rank expresses and summing ranks does
  // the exact opposite of.
  const freq: Array<[string, number]> = [...score.entries()]
    .map(([w, r]): [string, number] => [w, 1 / r])
    .sort((a, b) => b[1] - a[1]);
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
      // `nonstandard` matters as much as the rest: Wiktionary lists 해다 as a "nonstandard
      // form of 하다", and keeping it made the lemmatizer stop there — so 했습니다, 했어요 and
      // 해요, forms of the single most common verb in the language, all resolved to a
      // pseudo-headword glossed as a pointer instead of to 하다 itself.
      if (/^(alternative|hanja|synonym|nonstandard) (form|spelling) of /i.test(clean)) continue;
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
      // Harder judgement than `restricted`: slang/vulgar/obsolete/dialectal senses do not
      // count toward graded vocabulary. The gloss stays in the dictionary for lookups.
      const excluded = isNonStandardSense(s as { tags?: string[]; raw_tags?: string[] }) || isMetalinguisticGloss(clean);
      if (!senses.has(word)) senses.set(word, []);
      senses.get(word)!.push({ gloss: clean, restricted, excluded, order: senseOrder++ });
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
  /** headword → aggregated reciprocal-rank weight across all its surface forms */
  const lemmaFreq = new Map<string, number>();
  let direct = 0, viaLemma = 0, unresolved = 0;
  for (const [surface, weight] of freq) {
    let head: string | undefined;
    if (dict.has(surface)) { head = surface; direct++; }
    else {
      const lemma = lemmatizeKo(surface, dict);
      if (lemma && dict.has(lemma)) { head = lemma; viaLemma++; }
      else unresolved++;
    }
    if (head) lemmaFreq.set(head, (lemmaFreq.get(head) ?? 0) + weight);
  }
  const resolved = direct + viaLemma;
  const pct = (n: number) => `${((n / freq.length) * 100).toFixed(1)}%`;
  console.log(`  ${freq.length} tokens → ${resolved} resolved (${pct(resolved)})`);
  console.log(`    already a headword: ${direct} (${pct(direct)})`);
  console.log(`    resolved by lemmatizer: ${viaLemma} (${pct(viaLemma)})`);
  console.log(`    unresolved: ${unresolved} (${pct(unresolved)})`);
  console.log(`  → ${lemmaFreq.size} distinct headwords carry corpus frequency`);

  // ── 5. TOPIK bands (frequency approximation — see the header caveat) ───────
  // Headwords whose every sense is slang/vulgar/obsolete/dialectal never become study
  // material; they stay in kodict.json so they remain looked-up-able.
  const offRegister = new Set<string>();
  for (const [word, cands] of senses) if (isExcludedHeadword(cands)) offRegister.add(word);

  const ranked = [...lemmaFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .filter(w => dict.isCommonWord(w) && !offRegister.has(w));
  console.log(`  ${ranked.length} band-eligible headwords (${offRegister.size} excluded as slang/vulgar/obsolete/dialectal-only)`);

  // The cutoffs above assume ~12k ranked headwords. Korean yields fewer (its corpora are
  // the smallest of the three languages, and much of what they hold is names and
  // inflections we cannot resolve),
  // so scale the bands to the vocabulary actually available. Without this the top level
  // ends up a stub of whatever is left over rather than a real band.
  const topCutoff = TOPIK_BANDS[TOPIK_BANDS.length - 1].upTo;
  const scale = Math.min(1, ranked.length / topCutoff);
  if (scale < 1) {
    console.log(`  only ${ranked.length} ranked headwords available — scaling bands by ${scale.toFixed(2)}`);
  }

  const banded: Record<number, string[]> = {};
  let cursor = 0;
  for (const { level, upTo } of TOPIK_BANDS) {
    const end = Math.round(upTo * scale);
    banded[level] = ranked.slice(cursor, end);
    cursor = end;
  }

  // Same English cross-check as es/fr. TOPIK 1–6 and CEFR A1–C2 are different scales, but
  // both are six-point ORDINAL difficulty scales and the swap only ever compares a word's
  // anchor against its own band — no absolute equivalence between the two is claimed, and
  // none is needed, since a uniform offset between the scales cancels out in a trade.
  const { levels, report } = adjustBandsWithAnchor(banded, (w: string) => dictOut[w]?.m ?? '', anchorLevelOf);
  writeAnchorReport('ko', report, path.join(__dirname, 'reports'));

  const vocab: Record<string, { reading: string; meaning: string }> = {};
  for (const { level } of TOPIK_BANDS) {
    for (const w of levels[level]) vocab[w] = { reading: '', meaning: dictOut[w].m };
  }

  const levelsPath = path.join(ROOT, 'lib', 'data', 'topik-levels.ts');
  await emitData(levelsPath, 'TOPIK_LEVELS', 'Record<number, string[]>', levels, `// Auto-generated by scripts/build-kodic.mts — DO NOT EDIT BY HAND.
// Maps TOPIK level (1 = easiest … 6 = hardest) to its word list.
// TOPIK I covers levels 1–2; TOPIK II covers 3–6.
//
// NOTE: unlike HSK_LEVELS and JLPT_LEVELS, which come from official published exam word
// lists, TOPIK publishes no such list — the same situation as CEFR_LEVELS. These bands are
// a FREQUENCY APPROXIMATION: headwords ranked by frequency BLENDED ACROSS THREE REGISTERS
// (Tatoeba / Global Voices / Wikimedia, median ipm, so a surface must be common in at least
// two of them) after lemmatizing the corpus, since Korean surface forms are overwhelmingly
// inflected, and cut at the cumulative vocabulary sizes commonly cited per level. Headwords
// whose every sense is slang, vulgar, obsolete or dialectal are excluded outright. Useful
// as a study progression, not authoritative.`);
  console.log(`Wrote ${levelsPath} (${TOPIK_BANDS.map(b => `L${b.level}:${levels[b.level].length}`).join(' ')})`);

  const vocabPath = path.join(ROOT, 'lib', 'data', 'topik-vocab.ts');
  await emitData(vocabPath, 'TOPIK_VOCAB', 'Record<string, { reading: string; meaning: string }>', vocab, `// Auto-generated by scripts/build-kodic.mts — DO NOT EDIT BY HAND.
// TOPIK 1–6 vocabulary (source: Korean Wiktionary glosses, banded by blended cross-register
// corpus frequency — see the caveat in topik-levels.ts about these bands being approximate).
// 'reading' exists only to match the shape of HSK_VOCAB / JLPT_VOCAB / CEFR_VOCAB and is
// always '' for Korean: Hangul is phonetic and needs no separate reading line.`);
  console.log(`Wrote ${vocabPath} (${Object.keys(vocab).length} entries)`);
}

main().catch(err => { console.error(err); process.exit(1); });
