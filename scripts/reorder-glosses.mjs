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

/**
 * The generators' `restricted` flag comes from Wiktionary tags, which are gone by the time
 * a gloss is a string in a `;`-joined list. Only the metalinguistic tier can be recovered
 * here — which is the tier that was actually mis-ordered, so the reorder is a stable sort
 * that moves metalinguistic senses to the back and leaves everything else as the build
 * ranked it.
 */
function reorder(meaning, word, lang) {
  // A curated gloss wins outright — it exists precisely because reordering cannot help.
  const curated = CURATED.get(lang)?.get(word);
  if (curated) return curated;

  const parts = meaning.split(';').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return meaning;

  const real = parts.filter(p => !isMetalinguisticGloss(p));
  // Never empty an entry: a word whose every sense is metalinguistic keeps them in order.
  if (real.length === 0) return meaning;
  const ordered = [...real, ...parts.filter(p => isMetalinguisticGloss(p))];

  // A hand-set preference wins, but only ever by promoting a sense already present —
  // Wiktionary glosses an abbreviation's expansion as a plain word ("northwest" for `no`),
  // which no test of the gloss TEXT can distinguish from a real meaning.
  const want = LEAD_SENSE.get(lang)?.get(word);
  if (want) {
    const i = ordered.findIndex(p => p.toLowerCase().includes(want.toLowerCase()));
    if (i > 0) ordered.unshift(...ordered.splice(i, 1));
  }
  return ordered.join('; ');
}

/** @param {string} rel @param {string} lang @param {(e: unknown) => string|undefined} get @param {(e: unknown, m: string) => void} set */
async function repair(rel, lang, get, set) {
  const file = path.join(ROOT, rel);
  const data = JSON.parse(await readFile(file, 'utf8'));
  const changed = [];
  for (const [word, entry] of Object.entries(data)) {
    const before = get(entry);
    if (!before) continue;
    const after = reorder(before, word, lang);
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
