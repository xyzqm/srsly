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
 * A register may be backed by more than one corpus; their counts are summed.
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
 * Per-language register set. Spanish is the only consumer left: French moved to Lexique 3
 * (scripts/lib/lexique.mjs), which ships lemma-level film/book frequencies and needs no
 * corpus pass at all, and Korean was removed from the app.
 */
export const CORPORA = {
  es: {
    everyday:  [{ name: 'Tatoeba', url: `${OPUS}/OPUS-Tatoeba/v2023-04-12/mono/es.txt.gz` },
                { name: 'TED2020', url: `${OPUS}/OPUS-TED2020/v1/mono/es.txt.gz` }],
    news:      [{ name: 'GlobalVoices', url: `${OPUS}/OPUS-GlobalVoices/v2018q4/mono/es.txt.gz` }],
    reference: [{ name: 'wikimedia', url: `${OPUS}/OPUS-wikimedia/v20230407/mono/es.txt.gz` }],
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
 * @param {'es'} lang
 * @param {RegExp} tokenRe   global regex matching one token (must have the /g flag)
 * @param {{ maxTokens?: number, minCount?: number, normalize?: (t: string) => string }} [opts]
 *   `normalize` rewrites each matched token before counting.
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

// ── CEFR-J cross-check ───────────────────────────────────────────────────────

/**
 * Nudge the frequency bands using the English CEFR-J anchor (scripts/lib/cefrjAnchor.mjs).
 *
 * WHY SWAPS ACROSS A BOUNDARY, RATHER THAN REASSIGNING EACH WORD
 * The anchor has a large systematic bias: measured over the current bands its net pull is
 * about -3,400 levels for Spanish and -3,100 for French — it thinks almost everything is
 * easier than we banded it. That is structural, not an error: CEFR-J plus Octanove is
 * 8,845 English headwords weighted heavily toward A1–B2, so a genuinely C1 Spanish word
 * with a plain English gloss ("to gather") anchors at A2. Moving every word to its anchor,
 * or even one step toward it, would empty the upper bands into the lower ones.
 *
 * Swapping pairs across a boundary cancels that bias by construction. A uniform pull is a
 * no-op — if everything in B1 wants to be A2, nothing moves, because there is nothing
 * coming the other way to trade with. Only RELATIVE disagreement moves a word: a B1 word
 * whose gloss looks A1 trades places with an A2 word whose gloss looks B2. That also keeps
 * every band exactly the size the curriculum expects, and makes the ±1 limit a structural
 * property rather than something to check for afterwards — a word can only ever cross one
 * boundary, and is locked once it has.
 *
 * WHY A DISAGREEMENT OF ONE LEVEL IS IGNORED
 * `minDisagreement` defaults to 2. At 1 the anchor fires on noise and demotes core
 * vocabulary: `algo` ("something, anything; rather, somewhat") reads A2, `bueno` reads A2,
 * `trabajar` reads A2 — all of them unarguably A1 Spanish, all of them dropped out of A1 on
 * a one-level difference. The signal worth acting on is a word frequency put in A1 whose
 * translations look B1, not one that looks A2. Two levels is where the anchor stops being a
 * coin-flip about English register and starts being evidence.
 *
 * …EXCEPT AT THE ENDS OF THE SCALE, WHERE THE ANCHOR CANNOT SHOUT LOUDER
 * A two-level rule silently freezes the outermost boundaries. Moving a word UP into A1
 * would need an anchor of "A1 minus one", and there is no such level; moving one DOWN into
 * C2 would need "C2 plus one". So A1↔A2 and C1↔C2 had no candidates on one side, `k` was
 * always 0, and nothing ever crossed. For Spanish that went unnoticed, because its bands
 * come from a three-register blend that already had A1 about right. French exposed it: it
 * ranks off Lexique, whose two registers are film subtitles and books — BOTH narrative
 * fiction, which agree with each other about drama — so A1 filled with `souffrir`, `arme`
 * and `âme`, and the anchor was powerless to move them.
 *
 * An anchor sitting ON the floor is already disagreeing as hard as it can express. So a
 * saturated anchor (A1 when moving up, C2 when moving down) counts as sufficient
 * disagreement on its own. The rule is unchanged everywhere in the middle.
 *
 * @param {Record<number, string[]>} levels   band → words, in frequency order
 * @param {(word: string) => string} glossOf  the dictionary gloss for a word
 * @param {(gloss: string) => number|null} anchorLevelOf  from cefrjAnchor.mjs
 * @param {number} [minDisagreement=2]  how far the anchor must differ before it is acted on
 * @returns {{ levels: Record<number, string[]>, report: object }}
 */
export function adjustBandsWithAnchor(levels, glossOf, anchorLevelOf, minDisagreement = 2) {
  const bandNums = Object.keys(levels).map(Number).sort((a, b) => a - b);
  const floor = bandNums[0], ceiling = bandNums[bandNums.length - 1];

  /** Does the anchor say this word is harder than band `b` — clearly, or as hard as it can say? */
  const wantsHarder = (anchor, b) =>
    anchor !== null && anchor > b && (anchor - b >= minDisagreement || anchor === ceiling);
  /** …and the mirror, for a word the anchor says is easier than band `b`. */
  const wantsEasier = (anchor, b) =>
    anchor !== null && anchor < b && (b - anchor >= minDisagreement || anchor === floor);

  /** word → { band, rank (global, for restoring order), anchor } */
  const info = new Map();
  let rank = 0;
  for (const b of bandNums) {
    for (const w of levels[b]) info.set(w, { band: b, rank: rank++, anchor: anchorLevelOf(glossOf(w)) });
  }

  const members = new Map(bandNums.map(b => [b, new Set(levels[b])]));
  const locked = new Set();
  const moves = [];

  for (let i = 0; i < bandNums.length - 1; i++) {
    const b = bandNums[i], next = bandNums[i + 1];

    // Words sitting in `b` whose gloss reads harder than `b` — candidates to move down.
    // Nearest the boundary first: those are the ones frequency was least sure about.
    // `anchor !== null` is load-bearing, not defensive: null coerces to 0 in the arithmetic
    // below, so an UNANCHORED word reads as "easier than A1" and gets promoted into the
    // beginner band on no evidence whatsoever. That is how `blanca` ("minim, half note")
    // and `ca` ("initialism of corriente alterna") reached Spanish A1.
    const down = [...members.get(b)]
      .filter(w => !locked.has(w) && wantsHarder(info.get(w).anchor, b))
      .sort((x, y) => (info.get(y).anchor - info.get(x).anchor) || (info.get(y).rank - info.get(x).rank));

    // Words in `next` whose gloss reads easier — candidates to move up.
    const up = [...members.get(next)]
      .filter(w => !locked.has(w) && wantsEasier(info.get(w).anchor, next))
      .sort((x, y) => (info.get(x).anchor - info.get(y).anchor) || (info.get(x).rank - info.get(y).rank));

    const k = Math.min(down.length, up.length);
    for (let j = 0; j < k; j++) {
      const d = down[j], u = up[j];
      members.get(b).delete(d);   members.get(next).add(d);
      members.get(next).delete(u); members.get(b).add(u);
      locked.add(d); locked.add(u);
      moves.push({ word: d, from: b, to: next, anchor: info.get(d).anchor, gloss: glossOf(d) });
      moves.push({ word: u, from: next, to: b, anchor: info.get(u).anchor, gloss: glossOf(u) });
    }
  }

  // Rebuild each band in frequency order, so the only thing that changed is membership.
  const out = {};
  for (const b of bandNums) {
    out[b] = [...members.get(b)].sort((x, y) => info.get(x).rank - info.get(y).rank);
  }

  const anchored = [...info.values()].filter(v => v.anchor !== null).length;
  return {
    levels: out,
    report: {
      total: info.size,
      anchored,
      moves: moves.sort((a, b) => a.from - b.from || a.word.localeCompare(b.word)),
    },
  };
}
