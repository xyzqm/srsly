/**
 * Re-rank the senses inside the already-generated Spanish and French dictionaries so a
 * metalinguistic sense never leads.
 *
 * WHY THIS EXISTS RATHER THAN JUST REBUILDING
 * The ordering bug is fixed in build-esdict.mjs / build-frdict.mjs, which are the source of
 * truth. But a full rebuild streams ~1 GB per language from kaikki.org AND re-runs the
 * corpus blend, the CEFR-J anchor and the band cut — so it would reshuffle which words sit
 * in which level. Doing that to someone mid-study, to fix the order of a semicolon-separated
 * list, is the wrong trade. This applies the SAME predicate to the emitted files, changing
 * only the order of senses within each entry: no word gains or loses a definition, and no
 * band moves. The next real rebuild produces the same result from the generators.
 *
 * Idempotent — a sorted entry sorts to itself.
 *
 *   node scripts/reorder-glosses.mjs [--check]
 *
 * --check reports what would change and exits non-zero if anything would, for CI.
 */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { isMetalinguisticGloss } from './lib/registerFilter.mjs';
import { createRequire } from 'module';

/** Plain-object lookup would resolve dictionary words like `constructor` and `toString`
 *  against Object.prototype and hand back a function, so each language gets a Map. */
const OVERRIDES = createRequire(import.meta.url)('./data/core-overrides.json');
const byLang = (section) => new Map(
  Object.entries(section ?? {})
    .filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object')
    .map(([lang, prefs]) => [lang, new Map(Object.entries(prefs))]),
);
const LEAD_SENSE = byLang(OVERRIDES.leadSense);
/** Hand-written glosses, for entries the source is missing a core sense for. The one
 *  deliberate exception to "a definition comes from the dictionary or it does not exist";
 *  see the _why in core-overrides.json. Replaces the entry's gloss outright. */
const CURATED = byLang(OVERRIDES.curatedGloss);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/** "abbreviation of noroeste" → "noroeste". Also initialisms and acronyms. */
const ABBREV_OF = /^(?:abbreviation|initialism|acronym) of ([^(,;]+)/i;

/**
 * Senses that belong to an abbreviation reading rather than to the word itself.
 *
 * Wiktionary lists `no` as BOTH "abbreviation of noroeste" AND "northwest" — two senses for
 * one fact, and only the first is recognisable as metalinguistic from its text. The second
 * is what made `no` look like it meant northwest.
 *
 * Resolving the abbreviation's target in the same dictionary settles it without guesswork:
 * `noroeste` is itself a headword glossed "northwest", so a sibling sense equal to one of
 * ITS senses is the expansion and travels with it. Measured across Spanish this fires on
 * exactly the five compass abbreviations and nothing else.
 */
function expansionSenses(parts, dict) {
  const drop = new Set();
  for (const p of parts) {
    const target = ABBREV_OF.exec(p)?.[1]?.trim().toLowerCase();
    const entry = target && (dict[target]?.m ?? dict[target]?.meaning);
    if (!entry) continue;
    const targetSenses = new Set(entry.split(';').map(t => t.trim().toLowerCase()));
    // Also the abbreviation written out as bare initials: French lists `ne` as both
    // "abbreviation of nord-est" and "NE", and nord-est is glossed "northeast", so the
    // sense-text comparison alone misses it.
    const initials = target.split(/[\s-]+/).filter(Boolean).map(w => w[0]).join('').toUpperCase();
    for (const q of parts) {
      if (q === p) continue;
      if (targetSenses.has(q.toLowerCase()) || (initials.length > 1 && q.trim() === initials)) drop.add(q);
    }
  }
  return drop;
}

/**
 * Clean one entry: DELETE the senses a learner should never be shown, then order the rest.
 *
 * Demoting these was not enough. A gloss is read as a whole in the vocabulary list and the
 * flashcard, so "abbreviation of noroeste" sitting fourth is still four words of noise on
 * every card, and it is still a candidate answer in a level test. They are removed.
 *
 * An entry is never emptied: if every sense would go, the original is kept. A word whose
 * only meaning is metalinguistic is genuinely a letter name, and saying so beats saying
 * nothing.
 */
function reorder(meaning, word, lang, dict) {
  // A curated gloss wins outright — it exists precisely because the source cannot be fixed
  // by rearranging it. Senses omitted from the curated value are deleted deliberately.
  const curated = CURATED.get(lang)?.get(word);
  if (curated) return curated;

  const parts = meaning.split(';').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return meaning;

  const expansions = expansionSenses(parts, dict);
  const kept = parts.filter(p => !isMetalinguisticGloss(p) && !expansions.has(p));
  if (kept.length === 0) return meaning;   // nothing else to say — keep what there is

  const want = LEAD_SENSE.get(lang)?.get(word);
  if (want) {
    const i = kept.findIndex(p => p.toLowerCase().includes(want.toLowerCase()));
    if (i > 0) kept.unshift(...kept.splice(i, 1));
  }
  return kept.join('; ');
}

/** @param {string} rel @param {string} lang @param {(e: unknown) => string|undefined} get @param {(e: unknown, m: string) => void} set */
async function repair(rel, lang, get, set) {
  const file = path.join(ROOT, rel);
  const data = JSON.parse(await readFile(file, 'utf8'));
  const changed = [];
  for (const [word, entry] of Object.entries(data)) {
    const before = get(entry);
    if (!before) continue;
    const after = reorder(before, word, lang, data);
    if (after !== before) { changed.push([word, before, after]); set(entry, after); }
  }
  console.log(`${rel}: ${changed.length.toLocaleString()} of ${Object.keys(data).length.toLocaleString()} entries re-ranked`);
  for (const [w, b, a] of changed.slice(0, 6)) {
    console.log(`    ${w}\n      was: ${b}\n      now: ${a}`);
  }
  if (!CHECK && changed.length > 0) await writeFile(file, JSON.stringify(data));
  return changed.length;
}

let total = 0;
for (const [rel, lang] of [['public/esdict.json', 'es'], ['public/frdict.json', 'fr']]) {
  total += await repair(rel, lang, e => e.m, (e, m) => { e.m = m; });
}
for (const [rel, lang] of [['lib/data/cefr-vocab.json', 'es'], ['lib/data/fr-vocab.json', 'fr']]) {
  total += await repair(rel, lang, e => e.meaning, (e, m) => { e.meaning = m; });
}

if (CHECK && total > 0) {
  console.error(`\n${total} entries would change — run without --check.`);
  process.exit(1);
}
console.log(`\n${CHECK ? 'Would re-rank' : 'Re-ranked'} ${total.toLocaleString()} entries.`);
