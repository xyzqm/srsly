import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'Lexique383.tsv');

export const LEXIQUE_URL = 'http://www.lexique.org/databases/Lexique383/Lexique383.tsv';

/**
 * French word frequency from Lexique 3.
 *
 * WHY FRENCH DOESN'T USE THE CORPUS BLEND
 * Spanish ranks by counting three downloaded corpora (scripts/lib/corpusFreq.mjs). French
 * doesn't need to, because someone already did the work properly: Lexique 3 ships
 * 142,695 entries with hand-checked lemmas, part-of-speech tags, and — the part that
 * matters — frequency measured SEPARATELY over two registers:
 *
 *   freqlemfilms2   occurrences per million in a ~50M-word film subtitle corpus
 *   freqlemlivres   occurrences per million in a ~15M-word corpus of books
 *
 * Those are lemma-level counts, so there is no corpus to tokenize, no lemmatizer pass to
 * run over it, and no sampling cap to argue about. The numbers are also simply better than
 * anything we could compute: professionally compiled, POS-disambiguated, and stable.
 *
 * SCORING: the MINIMUM of the two.
 * A word is only as strong as its weaker register. That single choice is what removes
 * slang, and it does it far more cleanly than the ratio test one might reach for first —
 * `bonjour` has a films/livres ratio of 11 and is obviously core vocabulary, so skew alone
 * proves nothing. Measured against the top 500:
 *
 *   min          core 20/20 · slang in A1: NONE   (putain 1174, mec 708, flic 704, merde 792)
 *   geometric    core 20/20 · slang in A1: mec
 *   arithmetic   core 20/20 · slang in A1: putain, mec
 *
 * Subtitles are half the input here, which is the same OpenSubtitles register this project
 * deliberately moved away from — but as one of two votes rather than the only one, it is
 * an asset: it is what keeps spoken-but-standard vocabulary from being buried under
 * literary words, while the book side vetoes anything that only ever appears in dialogue.
 *
 * LICENSE — see scripts/data/ATTRIBUTION.md.
 * Lexique is distributed by OpenLexicon under CC BY-SA 4.0. Cite:
 *   New, B., Pallier, C., Brysbaert, M., & Ferrand, L. (2004). Lexique 2: A New French
 *   Lexical Database. Behavior Research Methods, Instruments, & Computers, 36(3), 516–524.
 */

/** Columns we read, by 0-based index in the TSV header. */
const COL = { ortho: 0, lemme: 2, cgram: 3, freqfilms: 6, freqlivres: 7, islem: 13 };

/**
 * Grammatical categories that are vocabulary. Lexique's `cgram` is far more precise than
 * anything Wiktionary gives us, so this replaces guesswork with a lookup.
 *
 * The closed classes (PRE, CON, PRO:*, ART:*, determiner-ish ADJ:*) are IN on purpose —
 * `de`, `que`, `mon`, `chaque` are exactly what a beginner needs. Out: ONO (onomatopoeia,
 * "boum", "aïe") and LIA (liaison artefacts), neither of which belongs on a flashcard.
 */
const CONTENT_CGRAM = new Set([
  'NOM', 'ADJ', 'VER', 'ADV', 'AUX',
  'PRE', 'CON',
  'ADJ:num', 'ADJ:ind', 'ADJ:pos', 'ADJ:dem', 'ADJ:int',
  'PRO:per', 'PRO:ind', 'PRO:pos', 'PRO:rel', 'PRO:int', 'PRO:dem',
  'ART:def', 'ART:ind',
]);

/**
 * Read Lexique 3 and rank its lemmas.
 *
 * @returns {{ rank: Map<string, number>, score: Map<string, number>, forms: Set<string>, total: number }}
 *   `rank`  lemma → 1-based rank, best first. Only lemmas attested in BOTH registers.
 *   `score` lemma → min(films ipm, books ipm)
 *   `forms` every surface form Lexique knows, inflections included — used to decide which
 *           entries of the Wiktionary form→lemma map are worth shipping to the client
 *   `total` how many rows the file had, for reporting
 */
export function lexiqueRanking() {
  if (!existsSync(FILE)) {
    throw new Error(
      `Lexique 3 not found at ${FILE}\n` +
      `Download it (about 25 MB) with:\n` +
      `  curl -L -o scripts/data/Lexique383.tsv ${LEXIQUE_URL}\n` +
      `See scripts/data/ATTRIBUTION.md for the licence and citation.`,
    );
  }

  const lines = readFileSync(FILE, 'utf8').split('\n');
  const score = new Map();
  const forms = new Set();
  let rows = 0;

  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t');
    if (c.length < 14) continue;
    rows++;

    const ortho = c[COL.ortho].trim().toLowerCase();
    if (ortho) forms.add(ortho);

    // Only lemma rows carry the headword we band; `freqlem*` on them is the whole lemma's
    // frequency, already summed over its inflections.
    if (c[COL.islem] !== '1') continue;
    if (!CONTENT_CGRAM.has(c[COL.cgram])) continue;

    const films = parseFloat(c[COL.freqfilms]) || 0;
    const livres = parseFloat(c[COL.freqlivres]) || 0;
    if (films <= 0 || livres <= 0) continue;   // must be attested in both registers

    // A form can be a lemma under several categories (`manger` is both NOM and VER). Keep
    // the strongest reading — that is the one a learner is actually meeting.
    const s = Math.min(films, livres);
    if (s > (score.get(ortho) ?? 0)) score.set(ortho, s);
  }

  const rank = new Map();
  let r = 0;
  for (const [word] of [...score.entries()].sort((a, b) => b[1] - a[1])) rank.set(word, ++r);

  return { rank, score, forms, total: rows };
}
