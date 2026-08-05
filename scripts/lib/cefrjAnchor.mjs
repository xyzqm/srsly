import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { isMetalinguisticGloss } from './registerFilter.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');

/**
 * An English CEFR level for a dictionary gloss — the cross-check signal for our own bands.
 *
 * WHAT THIS IS FOR
 * Our es/fr/ko levels are banded from cross-register corpus frequency (scripts/lib/
 * corpusFreq.mjs), which has no idea what a word MEANS. English does have a graded
 * vocabulary list that is both authoritative-ish and actually licensed, so we can ask a
 * second question of every word — "how basic is this word's English gloss?" — and use the
 * answer to nudge the frequency ordering.
 *
 * WHAT IT IS NOT FOR
 * It cannot be the primary source. Mapping English → target is hopelessly one-to-many:
 * 96% of CEFR-J's A1 words find a Spanish candidate, but 88% of them find MORE THAN ONE
 * (median 5, max 1351), and nothing in the mapping says which of `conseguir` / `obtener` /
 * `recibir` / `llegar` is the A1 word for "get". It also cannot see vocabulary that has no
 * English headword to hang off — 6% of our Spanish A1 (`los`, `del`, `esto`, `había`) and
 * 24% of Korean TOPIK 1 anchor to nothing at all. Frequency stays in charge; this votes.
 *
 * SOURCES — see scripts/data/ATTRIBUTION.md for the full licence text.
 *   The CEFR-J Wordlist Version 1.5, compiled by Yukio Tono, Tokyo University of Foreign
 *   Studies. Retrieved from http://www.cefr-j.org/download.html — free for research and
 *   commercial use provided it is cited, which is what this comment is.
 *
 *   Octanove Vocabulary Profile C1/C2 (ver 1.0) by Octanove Labs, CC BY-SA 4.0
 *   (https://creativecommons.org/licenses/by-sa/4.0/). CEFR-J stops at B2; Octanove
 *   continues the same scheme, and the two are read here as one six-level scale.
 *
 * Both files are vendored unmodified under scripts/data/ and are build-time only — no part
 * of either dataset reaches the client bundle.
 */

const ORD = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

const SOURCES = [
  'cefrj-vocabulary-profile-1.5.csv',
  'octanove-vocabulary-profile-c1c2-1.0.csv',
];

/** english headword → level 1–6, lowest wins when a word is listed at several levels/POS */
let cache = null;

function loadLevels() {
  if (cache) return cache;
  const lvl = new Map();
  for (const file of SOURCES) {
    const text = readFileSync(path.join(DATA, file), 'utf8');
    for (const line of text.split('\n').slice(1)) {
      const [headword, , code] = line.split(',');
      const level = ORD[(code ?? '').trim()];
      if (!headword || !level) continue;
      // Headwords bundle their spelling variants: "a.m./A.M./am/AM", "colour/color".
      for (const variant of headword.split('/')) {
        const w = variant.trim().toLowerCase();
        if (!w) continue;
        const prev = lvl.get(w);
        if (prev === undefined || level < prev) lvl.set(w, level);
      }
    }
  }
  cache = lvl;
  return lvl;
}

/** How many English headwords the combined scale knows. */
export function anchorSize() {
  return loadLevels().size;
}

/**
 * The English terms of a gloss's PRIMARY sense — everything before the first semicolon.
 * "to want, wish, desire; to expect" → ["want", "wish", "desire"]. Parentheticals are
 * dropped (elaboration, not translation) and the infinitive "to " is stripped so verbs
 * match CEFR-J's bare headwords.
 *
 * Only the first sense, because the build already ranks a word's core senses ahead of its
 * restricted ones, so segment one is the meaning a learner is actually being taught. Later
 * segments are where Wiktionary keeps the colourful material, and reading them as evidence
 * about difficulty is how `bueno` — glossed "good; tasty, yummy, good (of food); hot,
 * sexy" — came out at B1 and got demoted out of A1.
 */
function primaryTerms(gloss) {
  return String(gloss ?? '')
    .split(';')[0]
    .replace(/\([^)]*\)/g, '')
    .split(',')
    .map(t => t.trim().toLowerCase().replace(/^to /, ''))
    .filter(t => t && !t.includes(' '));
}

/**
 * The English CEFR level implied by a gloss, 1–6, or null when no term is on the scale.
 *
 * The EASIEST term of the PRIMARY sense. Both halves of that matter, and both were learnt
 * the hard way:
 *
 *   - Easiest, not median, WITHIN the sense. A sense is a list of near-synonyms — "in
 *     addition, moreover, furthermore, also" — and a learner only has to know one of them
 *     for the target word to be teachable at that level. Taking the median of that list
 *     scored `además` at B1 on the strength of "furthermore".
 *   - Primary sense only, not the whole gloss. Otherwise every later sense votes, and
 *     `bueno` reads B1 because "sexy" is in it.
 *
 * Reading the whole gloss anchors more words (66% of Spanish against 57%), but the extra
 * coverage is bought by scoring words on senses nobody is studying them for. The
 * two-level threshold in adjustBandsWithAnchor absorbs what noise is left.
 */
export function anchorLevelOf(gloss) {
  // A gloss that describes the string rather than translating it carries no signal about
  // difficulty. `a` is glossed "The first letter of the Spanish alphabet; bishop" — the
  // preposition is missing entirely — and `al` as "contraction of a + el". Both anchored
  // at B1 and were being demoted out of A1 on the strength of it.
  if (isMetalinguisticGloss(String(gloss ?? '').trim())) return null;

  const lvl = loadLevels();
  const levels = primaryTerms(gloss).map(t => lvl.get(t)).filter(Boolean);
  if (!levels.length) return null;
  return Math.min(...levels);
}

const CEFR_CODES = { 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2', 5: 'C1', 6: 'C2' };

/**
 * Write the disagreement report for one language and summarise it on stdout.
 *
 * The point of the file is that the swaps are reviewable BEFORE the emitted tables are
 * committed: every line is a word the English gloss disagreed with frequency about, what
 * it was, what it became, and the gloss that caused it. Reports are build artefacts, not
 * source — scripts/reports/ is gitignored.
 *
 * @param {string} lang    language code, used for the filename
 * @param {object} report  the `report` half of adjustBandsWithAnchor's return
 * @param {string} reportsDir  absolute path to scripts/reports
 */
export function writeAnchorReport(lang, report, reportsDir) {
  const { total, anchored, moves } = report;
  const pct = n => `${((n / total) * 100).toFixed(0)}%`;

  console.log(`  CEFR-J cross-check: ${anchored}/${total} words anchored (${pct(anchored)}), ${moves.length} moved`);
  if (!moves.length) {
    console.log('    no disagreements strong enough to trade across a boundary');
    return;
  }

  const byBoundary = new Map();
  for (const m of moves) {
    const key = `${CEFR_CODES[Math.min(m.from, m.to)]}↔${CEFR_CODES[Math.max(m.from, m.to)]}`;
    byBoundary.set(key, (byBoundary.get(key) ?? 0) + 1);
  }
  console.log(`    ${[...byBoundary].map(([k, n]) => `${k}: ${n}`).join('  ')}`);
  for (const m of moves.slice(0, 6)) {
    console.log(`    ${m.word} ${CEFR_CODES[m.from]}→${CEFR_CODES[m.to]} (gloss reads ${CEFR_CODES[m.anchor]}) — ${m.gloss.slice(0, 46)}`);
  }

  mkdirSync(reportsDir, { recursive: true });
  const file = path.join(reportsDir, `${lang}-band-adjustments.tsv`);
  const rows = moves.map(m =>
    [m.word, CEFR_CODES[m.from], CEFR_CODES[m.to], CEFR_CODES[m.anchor], m.gloss.replace(/\s+/g, ' ')].join('\t'));
  writeFileSync(file, ['word\tfrom\tto\tgloss_reads\tgloss', ...rows].join('\n') + '\n');
  console.log(`    full list → ${file}`);
}
