#!/usr/bin/env node
/**
 * Builds the Spanish language data from public open-source datasets:
 *
 *   public/esdict.json        — { surface: { p: "", m: meaning } }
 *                               the Spanish analogue of public/cedict.json and
 *                               public/jmdict.json. Used by lib/data/esdict.ts.
 *                               `p` (the reading slot) is ALWAYS "" for Spanish —
 *                               unlike pinyin/furigana there is nothing to annotate.
 *   lib/data/es-forms.ts      — ES_FORMS: inflected form → dictionary (lemma) form.
 *                               Drives lib/server/spanishLemmatizer.ts.
 *   lib/data/cefr-vocab.ts    — CEFR_VOCAB: lemma → { reading: '', meaning }
 *   lib/data/cefr-levels.ts   — CEFR_LEVELS: level(1–6) → lemma[]  (1 = A1 = easiest)
 *
 * Sources:
 *   - Spanish Wiktionary extract via kaikki.org (CC BY-SA 4.0). Supplies both the
 *     definitions AND the inflected-form → lemma map: Wiktionary records conjugations
 *     as `form_of` senses, so irregulars (fui → ser/ir, voy → ir) come out correct
 *     without hand-written rules.
 *   - Word frequencies blended across three registers — Tatoeba (everyday), Global Voices
 *     (news) and Wikimedia (reference) — by scripts/lib/corpusFreq.mjs. NOT subtitles:
 *     see that file for why one register of film dialogue made bad study lists.
 *
 * !! CEFR CAVEAT !!
 * Unlike HSK and JLPT, the CEFR publishes no official vocabulary list. The Instituto
 * Cervantes "Plan Curricular" inventories are neither machine-readable nor freely
 * redistributable, and CEFRLex/ELELex — which IS genuinely CEFR-graded — states no
 * license at all, so it cannot be vendored. The A1–C2 bands emitted here are therefore a
 * FREQUENCY APPROXIMATION: lemmas ranked by cross-register corpus frequency and cut at
 * the cumulative vocabulary sizes commonly cited for each CEFR tier. They are a usable
 * study progression, not an authoritative mapping — treat them accordingly.
 *
 * Run with: node scripts/build-esdict.mjs
 * Requires `curl` on PATH (same network assumption as build-cedict.mjs).
 */
import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { emitData } from './lib/emitData.mjs';
import { isNamePos, isNameSense } from './lib/nameFilter.mjs';
import { blendedFrequency, adjustBandsWithAnchor } from './lib/corpusFreq.mjs';
import { anchorLevelOf, writeAnchorReport } from './lib/cefrjAnchor.mjs';
import { applyCoreOverrides, reportCoreOverrides, applyDemotions, reportDemotions, leadSenseFor, curatedGlossFor } from './lib/coreOverrides.mjs';
import { isNonStandardSense, isExcludedHeadword, isLexicalPos, isMetalinguisticGloss, isBandableLength } from './lib/registerFilter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LANG = 'es';

const KAIKKI_URL = 'https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl';

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
const LEAD_SENSE = leadSenseFor('es');
const CURATED = curatedGlossFor('es');

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

const LETTER_RE = /^[a-záéíóúüñ]+(?:[ -][a-záéíóúüñ]+)*$/i;

/** One corpus token. Applied to lowercased text, so no case range is needed. */
const TOKEN_RE = /[a-záéíóúüñ]+/g;

async function main() {
  // ── 1. Cross-register frequency ────────────────────────────────────────────
  // Replaces the old single OpenSubtitles list. A lemma must be common in at least two of
  // the three registers to be ranked at all — see scripts/lib/corpusFreq.mjs.
  const { rank: freqRank } = await blendedFrequency('es', TOKEN_RE);

  // ── 2. Stream the Wiktionary extract ───────────────────────────────────────
  // ~1 GB of JSONL, so it is parsed line-by-line and never held in memory whole.
  console.log('Streaming Wiktionary extract from', KAIKKI_URL, '(~1 GB, a few minutes) ...');
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
    if (e.lang_code !== 'es' || typeof e.word !== 'string') continue;
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
        if (l && l !== lower && LETTER_RE.test(l) && freqRank.has(lower) && !forms.has(lower)) {
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
      // Per-sense, so `mercado` keeps "market" and loses only "a locative surname".
      if (isNameSense(clean)) continue;
      const restricted = (s.tags ?? []).some(t => RESTRICTED_TAGS.has(t))
        // A sense tagged with a country/region (e.g. "Chile") is regional even though the
        // tag itself is not in the list above; such tags are capitalised.
        || (s.tags ?? []).some(t => /^[A-Z]/.test(t));
      // Harder judgement than `restricted`: slang/vulgar/obsolete/dialectal senses do not
      // count toward graded vocabulary at all. The word still keeps the gloss in the
      // dictionary — only the level tables below apply this.
      const meta = isMetalinguisticGloss(clean);
      const excluded = isNonStandardSense(s) || meta;
      if (!senses.has(lower)) senses.set(lower, []);
      senses.get(lower).push({ gloss: clean, restricted, excluded, meta, order: senseOrder++ });
    }
  }
  await new Promise(res => proc.on('close', res));
  console.log(`  parsed ${lines.toLocaleString()} lines → ${senses.size} lemmas, ${forms.size} inflected forms`);

  // ── 3. esdict.json ─────────────────────────────────────────────────────────
  // `p` mirrors the {p, m} shape of cedict/jmdict so lib/data/esdict.ts can reuse the
  // same RawEntry type, but Spanish has no reading to put there.
  const dict = {};
  for (const [word, cands] of senses) {
    // Three tiers, original Wiktionary order within each, then dedupe:
    //   0 a plain meaning · 1 regional/slang/dated · 2 metalinguistic
    //
    // The third tier is what stops a word being defined by a description of its spelling.
    // Wiktionary lists `no` as "abbreviation of noroeste; northwest; not; no" — the actual
    // word is third — and `a` leads with "The first letter of the Spanish alphabet". These
    // were already detected (the `excluded` flag has always been computed here) but only
    // ever used to gate band eligibility, never to order the gloss the learner reads. That
    // gloss is the flashcard answer, the popup definition, and the level test's options.
    // Metalinguistic senses are DROPPED, not demoted. A gloss is read whole on a flashcard
    // and in the vocabulary list, so "abbreviation of noroeste" sitting fourth is still four
    // words of noise on every card — and still a candidate answer in a level test. An entry
    // is never emptied: a word with nothing else to say keeps them.
    const usable = cands.filter(c => !c.meta);
    const pool = usable.length > 0 ? usable : cands;
    const tier = c => (c.restricted ? 1 : 0);
    const ranked = pool
      .sort((a, b) => tier(a) - tier(b) || a.order - b.order)
      .map(c => c.gloss);
    // A curated gloss replaces the entry outright — it exists because this source is
    // missing a sense that reordering therefore cannot surface.
    const curated = CURATED.get(word);
    if (curated) { dict[word] = { p: '', m: curated }; continue; }

    // Otherwise: a hand-set preference, which can only ever promote a sense already here.
    const want = LEAD_SENSE.get(word);
    if (want) {
      // Exact first, substring as a fallback — see the note in build-frdict.mjs. Substring
      // alone silently no-ops whenever the wanted sense is contained in one that already leads.
      const lower = want.toLowerCase();
      let i = ranked.findIndex(g => g.trim().toLowerCase() === lower);
      if (i < 0) i = ranked.findIndex(g => g.toLowerCase().includes(lower));
      if (i > 0) ranked.unshift(...ranked.splice(i, 1));
    }
    const m = [...new Set(ranked)].slice(0, MAX_SENSES).join('; ');
    if (m) dict[word] = { p: '', m };
  }
  const dictPath = path.join(ROOT, 'public', 'esdict.json');
  await writeFile(dictPath, JSON.stringify(dict));
  console.log(`Wrote ${dictPath} (${Object.keys(dict).length} entries)`);

  // ── 4. es-forms.ts ─────────────────────────────────────────────────────────
  // Drop forms whose lemma we have no definition for — they cannot help a lookup.
  const usableForms = [...forms.entries()].filter(([, lemma]) => dict[lemma]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const formsPath = path.join(ROOT, 'lib', 'data', 'es-forms.ts');
  await emitData(formsPath, 'ES_FORMS', 'Record<string, string>', Object.fromEntries(usableForms), `// Auto-generated by scripts/build-esdict.mjs — DO NOT EDIT BY HAND.
// Inflected Spanish form → dictionary (lemma) form, sourced from Spanish Wiktionary's
// own \`form_of\` senses, so irregulars (fui → ser, voy → ir) are correct by construction.
// Scoped to forms that clear the blended cross-register frequency ranking — shipping the full
// conjugation table for every verb would be far larger than it is worth. Forms outside
// this set fall back to the suffix rules in lib/server/spanishLemmatizer.ts.`);
  console.log(`Wrote ${formsPath} (${usableForms.length} forms)`);

  // ── 5. CEFR bands (frequency approximation — see the header caveat) ────────
  // Words whose every sense is slang/vulgar/obsolete/dialectal (or purely metalinguistic,
  // like a letter name) are dropped here, not from the dictionary: they stay
  // looked-up-able, they just never become something to study.
  const offRegister = new Set();
  for (const [word, cands] of senses) if (isExcludedHeadword(cands)) offRegister.add(word);

  /**
   * Surfaces whose corpus frequency belongs to a DIFFERENT word they are spelled like.
   *
   * Spanish frequency is counted over raw lowercased surfaces, so a surface that is mostly
   * an inflection of something else gets credited to whatever homograph the dictionary
   * happens to gloss. That produced genuinely wrong A1 cards — not merely redundant ones:
   * `haya` ranked on haber's subjunctive and was taught as "beech tree", `partes` on the
   * plural of `parte` and taught as "genitalia", `alta` as "certificate of discharge",
   * `segunda` as "second gear", `nueva` as "news", `era` as "threshing floor".
   *
   * French needs none of this — Lexique gives POS-disambiguated lemma frequencies, so the
   * count on `porte` is the noun's and never the verb's.
   *
   * Three conditions, all required, each earning its place against a 37-word labelled set:
   *
   *   1. HIGH-FREQUENCY LEMMA. Only a very common paradigm generates enough count on one
   *      form to band it. Without this, `viaje` and `apoyo` were lost to `viajar`/`apoyar`.
   *   2. SMALL RANK GAP. If `casa` were merely "he/she marries" it could not be 37× more
   *      frequent than `casar` itself; that gap proves it is its own word. Every correct
   *      keep sits at ≥10.8×, every correct drop below 2.9×.
   *   3. UNRELATED GLOSSES. `trabajo`/`trabajar` both say "work", so the card is right even
   *      though the ranks are neighbours — that is a deverbal noun, not a homograph. This
   *      is the condition that separates a redundant entry from a WRONG one, and only the
   *      wrong ones are worth deleting.
   */
  const COLLISION_LEMMA_TOP = 800;   // lemma must be at least this frequent
  const COLLISION_RATIO = 5;         // …and within this factor of the form
  const GLOSS_STOP = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'with', 'or',
    'and', 'be', 'is', 'it', 'that', 'something', 'someone', 'used', 'as', 'by', 'at', 'from',
    'one', 'act', 'make', 'made', 'person', 'who', 'which', 'not']);

  /** Content words of a gloss's primary sense, for a crude relatedness test. */
  const glossTerms = (g) => new Set(String(g ?? '').toLowerCase().split(';')[0]
    .replace(/\([^)]*\)/g, '').split(/[,\s]+/)
    .map(t => t.replace(/^to$/, '').trim())
    .filter(t => t.length > 2 && !GLOSS_STOP.has(t)));

  const sharesMeaning = (a, b) => {
    const B = glossTerms(dict[b]?.m);
    for (const t of glossTerms(dict[a]?.m)) if (B.has(t)) return true;
    return false;
  };

  const collidesWithLemma = (w) => {
    const lemma = forms.get(w);
    if (!lemma) return false;
    const rw = freqRank.get(w), rl = freqRank.get(lemma);
    if (!rw || !rl) return false;                       // lemma unranked → surface stands alone
    if (rl > COLLISION_LEMMA_TOP) return false;         // 1
    if (rl / rw >= COLLISION_RATIO) return false;       // 2
    return !sharesMeaning(w, lemma);                    // 3
  };

  const rankedLemmas = [...freqRank.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([w]) => w)
    // NOTE: no `!forms.has(w)` guard. It looks right — an inflected form is not its own
    // vocabulary item — but it silently deleted much of the core vocabulary, because
    // Wiktionary also lists `casa` as a form of `casar`, `agua` of `aguar`, `libro` of
    // `librar` and `gracias` as the plural of `gracia`. `dict[w]` is the correct test on
    // its own: it is only populated from LEMMA senses, so a pure inflection never has one.
    .filter(w => dict[w] && lexical.has(w) && !offRegister.has(w) && isBandableLength(w, LANG)
              && !collidesWithLemma(w));
  const collided = [...freqRank.keys()].filter(w => dict[w] && collidesWithLemma(w)).length;
  console.log(`  ${rankedLemmas.length} band-eligible lemmas (${offRegister.size} excluded as slang/vulgar/obsolete/dialectal-only, ${collided} as inflections sharing a lemma's frequency)`);

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
  // second, so pinning wins if a word ever appears in both.
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

  const levelsPath = path.join(ROOT, 'lib', 'data', 'cefr-levels.ts');
  await emitData(levelsPath, 'CEFR_LEVELS', 'Record<number, string[]>', levels, `// Auto-generated by scripts/build-esdict.mjs — DO NOT EDIT BY HAND.
// Maps CEFR level (1 = A1 = easiest … 6 = C2 = hardest) to its word list.
//
// NOTE: unlike HSK_LEVELS and JLPT_LEVELS, which come from official published exam word
// lists, the CEFR publishes no such list. These bands are a FREQUENCY APPROXIMATION —
// lemmas ranked by frequency BLENDED ACROSS THREE REGISTERS (Tatoeba / Global Voices /
// Wikimedia, median ipm, so a word must be common in at least two of them), cut at the
// cumulative vocabulary sizes commonly cited for each tier. Headwords whose every sense is
// slang, vulgar, obsolete or dialectal are excluded outright. Useful as a study
// progression, not authoritative.`);
  console.log(`Wrote ${levelsPath} (${CEFR_BANDS.map(b => `${b.code}:${levels[b.level].length}`).join(' ')})`);

  const vocabPath = path.join(ROOT, 'lib', 'data', 'cefr-vocab.ts');
  await emitData(vocabPath, 'CEFR_VOCAB', 'Record<string, { reading: string; meaning: string }>', vocab, `// Auto-generated by scripts/build-esdict.mjs — DO NOT EDIT BY HAND.
// CEFR A1–C2 vocabulary (source: Spanish Wiktionary glosses, banded by blended
// cross-register corpus frequency — see the caveat in cefr-levels.ts about these bands being approximate).
// 'reading' exists only to match the shape of HSK_VOCAB / JLPT_VOCAB and is always ''
// for Spanish, which has no pinyin/furigana analogue.`);
  console.log(`Wrote ${vocabPath} (${Object.keys(vocab).length} entries)`);
}

main().catch(err => { console.error(err); process.exit(1); });
