#!/usr/bin/env node
/**
 * Builds the French language data from public open-source datasets:
 *
 *   public/frdict.json        — { surface: { p: "", m: meaning } }
 *                               the French analogue of public/esdict.json.
 *                               `p` (the reading slot) is ALWAYS "" for French —
 *                               unlike pinyin/furigana there is nothing to annotate.
 *   lib/data/fr-forms.ts      — FR_FORMS: inflected form → dictionary (lemma) form.
 *                               Drives lib/server/frenchLemmatizer.ts.
 *   lib/data/fr-vocab.ts      — FR_VOCAB: lemma → { reading: '', meaning }
 *   lib/data/fr-levels.ts     — FR_LEVELS: level(1–6) → lemma[]  (1 = A1 = easiest)
 *
 * Sources:
 *   - French Wiktionary extract via kaikki.org (CC BY-SA 4.0). Supplies both the
 *     definitions AND the inflected-form → lemma map. French conjugation is recorded
 *     exhaustively — a sample slice held 28,609 `form_of` entries against 1,658 lemmas —
 *     so suis → être and mangé → manger come out correct with no hand-written rules.
 *     This is why no npm lemmatizer is used: the JS options are Snowball STEMMERS, which
 *     produce non-words (manger → mang) and so can never pass dictionary validation.
 *   - Word frequencies from Lexique 3 (CC BY-SA 4.0), vendored at
 *     scripts/data/Lexique383.tsv. French does NOT use the corpus blend Spanish does:
 *     Lexique already ships lemma-level frequencies measured separately over film
 *     subtitles and over books, and a word is scored by the SMALLER of the two, so it has
 *     to earn its place in both registers. See scripts/lib/lexique.mjs.
 *
 * !! CEFR CAVEAT !!
 * Unlike HSK and JLPT, the CEFR publishes no official vocabulary list — the same caveat
 * that applies to Spanish (see lib/data/cefr-levels.ts). FLELex, which IS genuinely
 * CEFR-graded from learner textbooks, states no license anywhere and so cannot be
 * vendored. The A1–C2 bands emitted here are a FREQUENCY APPROXIMATION: lemmas ranked by
 * Lexique 3's film/book frequencies and cut at the cumulative vocabulary sizes commonly
 * cited for each tier. A usable study progression, not an authoritative mapping.
 *
 * Run with: node scripts/build-frdict.mjs
 * Requires `curl` on PATH for the Wiktionary extract, and scripts/data/Lexique383.tsv
 * to be present (the script prints the download command if it is not).
 */
import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { emitData } from './lib/emitData.mjs';
import { isNamePos, isNameSense } from './lib/nameFilter.mjs';
import { adjustBandsWithAnchor } from './lib/corpusFreq.mjs';
import { lexiqueRanking } from './lib/lexique.mjs';
import { anchorLevelOf, writeAnchorReport } from './lib/cefrjAnchor.mjs';
import { applyCoreOverrides, reportCoreOverrides, applyDemotions, reportDemotions } from './lib/coreOverrides.mjs';
import { isNonStandardSense, isExcludedHeadword, isLexicalPos, isMetalinguisticGloss, isBandableLength } from './lib/registerFilter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LANG = 'fr';

const KAIKKI_URL = 'https://kaikki.org/dictionary/French/kaikki.org-dictionary-French.jsonl';

/** Cumulative lemma counts per CEFR tier — the commonly cited receptive-vocabulary
 *  sizes for each level. Bands are cut from the frequency ranking at these offsets. */
const CEFR_BANDS = [
  { level: 1, code: 'A1', upTo: 500 },
  { level: 2, code: 'A2', upTo: 1500 },
  { level: 3, code: 'B1', upTo: 3000 },
  { level: 4, code: 'B2', upTo: 5000 },
  { level: 5, code: 'C1', upTo: 8000 },
  { level: 6, code: 'C2', upTo: 12000 },
];

/** Max characters of gloss text kept per sense — keeps esdict.json in the same size
 *  class as cedict.json/jmdict.json instead of ballooning with encyclopedic senses.
 *  Over-long glosses are TRIMMED, never dropped: Wiktionary's primary sense is often the
 *  most verbose one ("dog (the species Canis familiaris, domesticated for…)"), and
 *  discarding it would leave a word defined only by its regional or slang senses. */
const MAX_MEANING = 90;
const MAX_SENSES = 3;

/** Tags marking a sense as non-core. Such senses are kept, but always rank below plain
 *  ones, so `perro` leads with "dog" rather than with its Chilean or derogatory senses. */
const RESTRICTED_TAGS = new Set([
  'obsolete', 'archaic', 'rare', 'dated', 'historical', 'poetic', 'literary',
  'slang', 'vulgar', 'derogatory', 'offensive', 'colloquial', 'informal',
  'dialectal', 'regional', 'nonstandard', 'humorous', 'euphemistic',
]);

function curlStream(url) {
  const proc = spawn('curl', ['-sL', '--max-time', '900', url], { stdio: ['ignore', 'pipe', 'inherit'] });
  return proc;
}

/** Wiktionary glosses carry a lot of parenthetical/registry noise; trim to something
 *  that reads like the short definitions CC-CEDICT and JMdict give. */
function cleanGloss(g) {
  let s = String(g)
    .replace(/\s+/g, ' ')
    .replace(/^\((?:[^)]*)\)\s*/, '')   // leading "(colloquial) " style qualifiers
    .trim();
  if (s.length <= MAX_MEANING) return s;
  // Too long: drop the parenthetical elaboration, which is where Wiktionary puts its
  // encyclopedic detail ("dog (the species Canis familiaris…)" → "dog"). Cut from the
  // FIRST " (" so nested parens cannot leave a dangling fragment behind.
  const head = s.split(' (')[0].trim();
  if (head.length >= 3) { if (head.length <= MAX_MEANING) return head; s = head; }
  if (s.length <= MAX_MEANING) return s;
  // Still long: cut to the last whole word that fits, then back off to a clause boundary
  // if there is one, so the gloss ends somewhere a reader would expect.
  let cut = s.slice(0, MAX_MEANING + 1).replace(/\s+\S*$/, '').trim();
  const clause = cut.replace(/[,;:]\s[^,;:]*$/, '').trim();
  if (clause.length >= 12) cut = clause;
  const open = (cut.match(/\(/g) ?? []).length;
  const close = (cut.match(/\)/g) ?? []).length;
  if (open > close) cut = cut.slice(0, cut.lastIndexOf('(')).trim();
  return cut.replace(/[,;:]$/, '').trim();
}

/** A French headword: letters plus the marks that sit INSIDE a word — the apostrophe of
 *  aujourd'hui and the hyphen of peut-être. Elision at the START (l'eau, d'accord) is a
 *  separate concern, handled by the lemmatizer, not here. */
const LETTER_RE = /^[a-zàâäçéèêëîïôöùûüÿœæ]+(?:[ '\u2019-][a-zàâäçéèêëîïôöùûüÿœæ]+)*$/i;

async function main() {
  // ── 1. Frequency from Lexique 3 ────────────────────────────────────────────
  // Lemma-level, dual-register, already computed — no corpus to download or tokenize.
  const { rank: freqRank, forms: lexiqueForms, total } = lexiqueRanking();
  console.log(`Lexique 3: ${total.toLocaleString()} rows → ${freqRank.size.toLocaleString()} lemmas attested in both films and books, ${lexiqueForms.size.toLocaleString()} surface forms`);

  // ── 2. Stream the Wiktionary extract ───────────────────────────────────────
  // ~570 MB of JSONL, so it is parsed line-by-line and never held in memory whole.
  console.log('Streaming Wiktionary extract from', KAIKKI_URL, '(~570 MB, a few minutes) ...');
  /** lemma → candidate senses, ranked at write time (core senses before restricted ones) */
  const senses = new Map();
  let senseOrder = 0;
  /** inflected form → lemma (only kept for forms that appear in the frequency list) */
  const forms = new Map();
  /** lemmas that appear under at least one real part of speech, i.e. not only as a letter
   *  name, symbol or bound affix — see isLexicalPos. */
  const lexical = new Set();

  const proc = curlStream(KAIKKI_URL);
  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });

  let lines = 0;
  for await (const line of rl) {
    if (!line) continue;
    if (++lines % 250_000 === 0) console.log(`  ${lines.toLocaleString()} lines…`);
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.lang_code !== 'fr' || typeof e.word !== 'string') continue;
    const word = e.word.trim();
    if (!word || !LETTER_RE.test(word)) continue;
    // Proper nouns are not vocabulary — see scripts/lib/nameFilter.mjs.
    if (isNamePos(e.pos)) continue;
    const lower = word.toLowerCase();
    if (isLexicalPos(e.pos)) lexical.add(lower);

    for (const s of e.senses ?? []) {
      // Inflected form: record form → lemma. Wiktionary's own conjugation data means
      // irregular verbs resolve correctly with no rule-writing on our side.
      const lemma = s.form_of?.[0]?.word;
      if (lemma && typeof lemma === 'string') {
        const l = lemma.trim().toLowerCase();
        // Only forms we could plausibly meet in a passage are worth bundling — the full
        // form table for every Spanish verb is far too large to ship.
        if (l && l !== lower && LETTER_RE.test(l) && lexiqueForms.has(lower) && !forms.has(lower)) {
          forms.set(lower, l);
        }
        continue;
      }
      // Lemma sense: keep the gloss as a ranked candidate. Only the FIRST gloss of a
      // sense is the definition — any further ones are sub-senses of it.
      const g = (s.glosses ?? [])[0];
      if (!g) continue;
      const clean = cleanGloss(g);
      if (!clean) continue;
      if (/^(inflection|plural|feminine|masculine) of /i.test(clean)) continue;
      // Contractions are headwords in French Wiktionary — `j'ai` is glossed "compound of je
      // and ai", `c'est` "contraction of ce + est". Keeping them traps the lemmatizer: its
      // first test is "is this surface already a headword?", so `j'ai` stopped at itself
      // with a grammar note for a definition and never linked to the `avoir` card. Dropping
      // the sense lets the proclitic peel and resolve. `aujourd'hui` and `d'accord` are
      // ordinary headwords, not contractions, so they match neither pattern and survive.
      if (/^(contraction|compound) of /i.test(clean)) continue;
      // Per-sense, so `mercado` keeps "market" and loses only "a locative surname".
      if (isNameSense(clean)) continue;
      const restricted = (s.tags ?? []).some(t => RESTRICTED_TAGS.has(t))
        // A sense tagged with a country/region (e.g. "Chile") is regional even though the
        // tag itself is not in the list above; such tags are capitalised.
        || (s.tags ?? []).some(t => /^[A-Z]/.test(t));
      // Harder judgement than `restricted`: slang/vulgar/obsolete/dialectal senses do not
      // count toward graded vocabulary at all. The word still keeps the gloss in the
      // dictionary — only the level tables below apply this.
      const excluded = isNonStandardSense(s) || isMetalinguisticGloss(clean);
      if (!senses.has(lower)) senses.set(lower, []);
      senses.get(lower).push({ gloss: clean, restricted, excluded, order: senseOrder++ });
    }
  }
  await new Promise(res => proc.on('close', res));
  console.log(`  parsed ${lines.toLocaleString()} lines → ${senses.size} lemmas, ${forms.size} inflected forms`);

  // ── 3. esdict.json ─────────────────────────────────────────────────────────
  // `p` mirrors the {p, m} shape of cedict/jmdict so lib/data/esdict.ts can reuse the
  // same RawEntry type, but Spanish has no reading to put there.
  const dict = {};
  for (const [word, cands] of senses) {
    // Core senses first, original Wiktionary order within each group, then dedupe.
    const ranked = cands
      .sort((a, b) => (a.restricted === b.restricted ? a.order - b.order : a.restricted ? 1 : -1))
      .map(c => c.gloss);
    const m = [...new Set(ranked)].slice(0, MAX_SENSES).join('; ');
    if (m) dict[word] = { p: '', m };
  }
  const dictPath = path.join(ROOT, 'public', 'frdict.json');
  await writeFile(dictPath, JSON.stringify(dict));
  console.log(`Wrote ${dictPath} (${Object.keys(dict).length} entries)`);

  // ── 4. es-forms.ts ─────────────────────────────────────────────────────────
  // Drop forms whose lemma we have no definition for — they cannot help a lookup.
  const usableForms = [...forms.entries()].filter(([, lemma]) => dict[lemma]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const formsPath = path.join(ROOT, 'lib', 'data', 'fr-forms.ts');
  await emitData(formsPath, 'FR_FORMS', 'Record<string, string>', Object.fromEntries(usableForms), `// Auto-generated by scripts/build-frdict.mjs — DO NOT EDIT BY HAND.
// Inflected French form → dictionary (lemma) form, sourced from French Wiktionary's own
// \`form_of\` senses, so irregulars (suis → être, ai → avoir) are correct by construction.
// Scoped to the surface forms Lexique 3 actually attests — shipping the full conjugation
// table for every verb would be far larger than it is worth. Forms outside this set fall
// back to the suffix rules in lib/server/frenchLemmatizer.ts.`);
  console.log(`Wrote ${formsPath} (${usableForms.length} forms)`);

  // ── 5. CEFR bands (frequency approximation — see the header caveat) ────────
  // Words whose every sense is slang/vulgar/obsolete/dialectal (or purely metalinguistic,
  // like a letter name) are dropped here, not from the dictionary: they stay
  // looked-up-able, they just never become something to study.
  const offRegister = new Set();
  for (const [word, cands] of senses) if (isExcludedHeadword(cands)) offRegister.add(word);

  const rankedLemmas = [...freqRank.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([w]) => w)
    // NOTE: no `!forms.has(w)` guard. It looks right — an inflected form is not its own
    // vocabulary item — but it silently deleted much of the core vocabulary, because
    // Wiktionary also lists `casa` as a form of `casar`, `agua` of `aguar`, `libro` of
    // `librar` and `gracias` as the plural of `gracia`. `dict[w]` is the correct test on
    // its own: it is only populated from LEMMA senses, so a pure inflection never has one.
    .filter(w => dict[w] && lexical.has(w) && !offRegister.has(w) && isBandableLength(w, LANG));
  console.log(`  ${rankedLemmas.length} band-eligible lemmas (${offRegister.size} headwords excluded as slang/vulgar/obsolete/dialectal-only)`);

  const banded = {};
  let cursor = 0;
  for (const { level, upTo } of CEFR_BANDS) {
    banded[level] = rankedLemmas.slice(cursor, upTo);
    cursor = upTo;
  }

  // Second opinion from the English CEFR-J scale. Frequency decides the ordering; this only
  // trades words across a band boundary where the two disagree in opposite directions.
  const { levels: adjusted, report } = adjustBandsWithAnchor(banded, w => dict[w]?.m ?? '', anchorLevelOf);
  writeAnchorReport(LANG, report, path.join(__dirname, 'reports'));

  // Then the two hand-set lists, after the anchor so both bypass it. Demote first, pin
  // second: pinning is the more explicit statement, so it gets the final say if a word
  // ever appears in both lists.
  const demoted = applyDemotions(LANG, adjusted, w => !!dict[w]?.m);
  reportDemotions(demoted);

  const sizeBefore = demoted.levels[1].length;
  const overridden = applyCoreOverrides(LANG, demoted.levels, w => !!dict[w]?.m);
  reportCoreOverrides(overridden, sizeBefore);
  const levels = overridden.levels;

  const vocab = {};
  for (const { level } of CEFR_BANDS) {
    for (const w of levels[level]) vocab[w] = { reading: '', meaning: dict[w].m };
  }

  const levelsPath = path.join(ROOT, 'lib', 'data', 'fr-levels.ts');
  await emitData(levelsPath, 'FR_LEVELS', 'Record<number, string[]>', levels, `// Auto-generated by scripts/build-frdict.mjs — DO NOT EDIT BY HAND.
// Maps CEFR level (1 = A1 = easiest … 6 = C2 = hardest) to its word list.
//
// NOTE: unlike HSK_LEVELS and JLPT_LEVELS, which come from official published exam word
// lists, the CEFR publishes no such list. These bands are a FREQUENCY APPROXIMATION —
// lemmas ranked by Lexique 3's dual-register frequency — scored on the SMALLER of its film
// and book counts, so a word has to be common in both — and cut at the cumulative
// vocabulary sizes commonly cited for each tier. Headwords whose every sense is slang,
// vulgar, obsolete or dialectal are excluded outright. Useful as a study progression, not
// authoritative.`);
  console.log(`Wrote ${levelsPath} (${CEFR_BANDS.map(b => `${b.code}:${levels[b.level].length}`).join(' ')})`);

  const vocabPath = path.join(ROOT, 'lib', 'data', 'fr-vocab.ts');
  await emitData(vocabPath, 'FR_VOCAB', 'Record<string, { reading: string; meaning: string }>', vocab, `// Auto-generated by scripts/build-frdict.mjs — DO NOT EDIT BY HAND.
// CEFR A1–C2 vocabulary (source: French Wiktionary glosses, banded by Lexique 3
// dual-register frequency — see the caveat in cefr-levels.ts about these bands being approximate).
// 'reading' exists only to match the shape of HSK_VOCAB / JLPT_VOCAB and is always ''
// for French, which has no pinyin/furigana analogue.`);
  console.log(`Wrote ${vocabPath} (${Object.keys(vocab).length} entries)`);
}

main().catch(err => { console.error(err); process.exit(1); });
