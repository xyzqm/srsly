import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { createGunzip } from 'zlib';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

/**
 * Blended, multi-register word frequency.
 *
 * WHY NOT SUBTITLES
 * Every language here used to rank against hermitdave/FrequencyWords, which is built from
 * OpenSubtitles — i.e. film and TV dialogue and nothing else. One register, and a narrow
 * one: its high-frequency band is dominated by interjections, profanity, discourse
 * particles and slang, because that is what characters say. Banding vocabulary from it
 * produced study lists full of words the passage generator then had to work into prose,
 * which it does badly, because they are not prose words.
 *
 * THE FIX
 * Rank against three REGISTERS and keep what they agree on:
 *
 *   everyday   Tatoeba + TED2020  — example sentences and prepared talks
 *   news       Global Voices      — citizen journalism, edited prose
 *   reference  Wikimedia          — encyclopedic writing
 *
 * A register may be backed by more than one corpus (their counts are summed) — Korean's
 * Tatoeba slice is only ~50k tokens, far too thin to stand on its own.
 *
 * SCORING: mean of the two best per-register RANKS.
 * Each register is ranked independently, then a word scores the average of its two best
 * positions. Two consequences, both wanted:
 *
 *   - A word must place in at least two registers to score at all, which is the
 *     "common in more than one register" requirement.
 *   - Ranking, not raw frequency, is what gets averaged. Occurrences-per-million are not
 *     comparable across registers — an encyclopedia says "municipality" at a rate no
 *     conversation ever will — so averaging ipm lets whichever corpus has the most extreme
 *     distribution set the order. Rank space is invariant to that.
 *
 * Taking the best TWO rather than all three is what keeps a word from being punished for
 * being rare in one place: `gracias` barely appears in an encyclopedia, and should still
 * be an A1 word.
 *
 * LICENSING
 * Tatoeba CC BY, TED2020 CC BY-NC-ND (counted, never redistributed), Global Voices CC BY,
 * Wikimedia CC BY-SA. Nothing from these corpora ships: what gets committed is a ranked
 * list of dictionary headwords, and counts of words are facts, not the corpus text.
 */

const OPUS = 'https://object.pouta.csc.fi';

/**
 * Per-language register set. The register MIX is identical across languages so the bands
 * mean the same thing in each; only the individual corpora differ where a language has no
 * release (Korean has no News-Commentary, hence Global Voices for news everywhere).
 */
export const CORPORA = {
  es: {
    everyday:  [{ name: 'Tatoeba', url: `${OPUS}/OPUS-Tatoeba/v2023-04-12/mono/es.txt.gz` },
                { name: 'TED2020', url: `${OPUS}/OPUS-TED2020/v1/mono/es.txt.gz` }],
    news:      [{ name: 'GlobalVoices', url: `${OPUS}/OPUS-GlobalVoices/v2018q4/mono/es.txt.gz` }],
    reference: [{ name: 'wikimedia', url: `${OPUS}/OPUS-wikimedia/v20230407/mono/es.txt.gz` }],
  },
  fr: {
    everyday:  [{ name: 'Tatoeba', url: `${OPUS}/OPUS-Tatoeba/v2023-04-12/mono/fr.txt.gz` },
                { name: 'TED2020', url: `${OPUS}/OPUS-TED2020/v1/mono/fr.txt.gz` }],
    news:      [{ name: 'GlobalVoices', url: `${OPUS}/OPUS-GlobalVoices/v2018q4/mono/fr.txt.gz` }],
    reference: [{ name: 'wikimedia', url: `${OPUS}/OPUS-wikimedia/v20230407/mono/fr.txt.gz` }],
  },
  ko: {
    everyday:  [{ name: 'Tatoeba', url: `${OPUS}/OPUS-Tatoeba/v2023-04-12/mono/ko.txt.gz` },
                { name: 'TED2020', url: `${OPUS}/OPUS-TED2020/v1/mono/ko.txt.gz` }],
    news:      [{ name: 'GlobalVoices', url: `${OPUS}/OPUS-GlobalVoices/v2018q4/mono/ko.txt.gz` }],
    reference: [{ name: 'wikimedia', url: `${OPUS}/OPUS-wikimedia/v20230407/mono/ko.txt.gz` }],
  },
};

/** Stop after this many tokens per corpus. A top-12k ranking converges long before this;
 *  the cap is what keeps the Spanish Wikimedia dump (~700 MB of text) from dominating the
 *  build time for no gain in the only part of the ranking we actually cut bands from. */
const MAX_TOKENS = 25_000_000;

/** Ignore a token seen fewer than this many times in one register — typos and OCR debris
 *  appear once. Kept low: the two-register rule is the real filter, and Korean's corpora
 *  are small enough that a high threshold would empty them. */
const MIN_COUNT = 2;

/** Set SRSLY_CORPUS_CACHE=<dir> to keep per-corpus counts on disk. Re-running a build then
 *  costs no downloads at all, which is the difference between iterating on the banding in
 *  seconds and re-fetching 400 MB every time. Never used by CI; purely a dev convenience. */
const CACHE_DIR = process.env.SRSLY_CORPUS_CACHE || '';

async function readCache(key) {
  if (!CACHE_DIR) return null;
  try {
    const raw = await readFile(path.join(CACHE_DIR, `${key}.json`), 'utf8');
    const { counts, total } = JSON.parse(raw);
    return { counts: new Map(counts), total };
  } catch {
    return null;
  }
}

async function writeCache(key, counts, total) {
  if (!CACHE_DIR) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify({ counts: [...counts], total }));
  } catch { /* cache is optional */ }
}

/** Count one corpus. Streams curl → gunzip → lines so nothing is held whole in memory. */
async function countCorpus({ name, url }, lang, tokenRe, maxTokens, normalize) {
  const cacheKey = `${lang}-${name}`;
  const cached = await readCache(cacheKey);
  if (cached) {
    console.log(`    ${name}: ${cached.total.toLocaleString()} tokens (cached)`);
    return cached;
  }

  const counts = new Map();
  let total = 0;

  const proc = spawn('curl', ['-sL', '--max-time', '1800', url], { stdio: ['ignore', 'pipe', 'inherit'] });
  const gunzip = createGunzip();
  proc.stdout.pipe(gunzip);
  const rl = createInterface({ input: gunzip, crlfDelay: Infinity });

  for await (const line of rl) {
    const toks = line.toLowerCase().match(tokenRe);
    if (!toks) continue;
    for (const raw of toks) {
      const t = normalize ? normalize(raw) : raw;
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
      total++;
    }
    if (total >= maxTokens) break;
  }
  rl.close();
  gunzip.destroy();
  // The stream was probably abandoned at the cap; kill curl rather than sit waiting on the
  // rest of a download we have already stopped reading.
  proc.kill('SIGTERM');

  console.log(`    ${name}: ${total.toLocaleString()} tokens, ${counts.size.toLocaleString()} types`);
  await writeCache(cacheKey, counts, total);
  return { counts, total };
}

/**
 * Rank a language's vocabulary by cross-register frequency.
 *
 * @param {'es'|'fr'|'ko'} lang
 * @param {RegExp} tokenRe   global regex matching one token (must have the /g flag)
 * @param {{ maxTokens?: number, minCount?: number, normalize?: (t: string) => string }} [opts]
 *   `normalize` rewrites each matched token before counting — French uses it to peel the
 *   elided proclitic off `l'eau` so the count lands on `eau`, the actual headword.
 * @returns {Promise<{ rank: Map<string, number>, score: Map<string, number>, registers: Map<string, number> }>}
 *   `rank`      surface → 1-based rank, best first (only words placing in ≥2 registers)
 *   `score`     surface → blended score (mean of two best register ranks; LOWER is better)
 *   `registers` surface → how many registers it placed in, for reporting
 */
export async function blendedFrequency(lang, tokenRe, opts = {}) {
  const maxTokens = opts.maxTokens ?? MAX_TOKENS;
  const minCount = opts.minCount ?? MIN_COUNT;
  const registerSet = CORPORA[lang];
  if (!registerSet) throw new Error(`no corpus set defined for language '${lang}'`);
  const registerNames = Object.keys(registerSet);

  console.log(`Counting ${registerNames.length} registers for '${lang}' (cap ${maxTokens.toLocaleString()} tokens per corpus) …`);

  /** surface → per-register rank, index-aligned with registerNames; absent = undefined */
  const ranksByWord = new Map();

  for (let i = 0; i < registerNames.length; i++) {
    const register = registerNames[i];
    console.log(`  ${register}:`);
    // Sum the corpora backing this register into one count table.
    const merged = new Map();
    let total = 0;
    for (const corpus of registerSet[register]) {
      const { counts, total: t } = await countCorpus(corpus, lang, tokenRe, maxTokens, opts.normalize);
      for (const [w, n] of counts) merged.set(w, (merged.get(w) ?? 0) + n);
      total += t;
    }
    if (!total) throw new Error(`register '${register}' for '${lang}' yielded no tokens`);

    const ordered = [...merged.entries()].filter(([, n]) => n >= minCount).sort((a, b) => b[1] - a[1]);
    ordered.forEach(([w], idx) => {
      let row = ranksByWord.get(w);
      if (!row) { row = new Array(registerNames.length).fill(undefined); ranksByWord.set(w, row); }
      row[i] = idx + 1;
    });
    console.log(`    → ${ordered.length.toLocaleString()} types ranked (${total.toLocaleString()} tokens)`);
  }

  const score = new Map();
  const registers = new Map();
  for (const [word, row] of ranksByWord) {
    const placed = row.filter(r => r !== undefined).sort((a, b) => a - b);
    if (placed.length < 2) continue;           // must be common in more than one register
    score.set(word, (placed[0] + placed[1]) / 2);
    registers.set(word, placed.length);
  }

  const rank = new Map();
  let r = 0;
  for (const [word] of [...score.entries()].sort((a, b) => a[1] - b[1])) rank.set(word, ++r);

  const all = [...registers.values()].filter(n => n === registerNames.length).length;
  console.log(`  ${ranksByWord.size.toLocaleString()} types seen → ${rank.size.toLocaleString()} kept (in ≥2 registers; ${all.toLocaleString()} in all ${registerNames.length})`);
  return { rank, score, registers };
}
