/**
 * Audit every emitted gloss for defects we can actually detect.
 *
 * WHAT THIS CAN AND CANNOT DO
 * There are ~213,000 headwords across the four dictionaries. Nobody is reading those, and
 * "is this definition correct?" is not a question a script can answer in general — it would
 * need a second, better source, which is the thing we do not have. What a script CAN do is
 * find the shapes a wrong gloss takes, and count them, so a defect is either fixed or known
 * rather than discovered one screenshot at a time.
 *
 * Each class below came from a gloss that was actually wrong on screen.
 *
 *   node scripts/audit-glosses.mjs [--list=<class>] [--limit=N]
 */
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { isMetalinguisticGloss } from './lib/registerFilter.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const LIST = arg('list');
const LIMIT = Number(arg('limit') ?? 15);

/** The `primera` class: a headword that is the regular feminine/plural of an `-o` lemma.
 *
 * Wiktionary files "feminine singular of primero" as a form_of sense, and the build drops
 * those (they belong in the FORMS map, not in a definition), so `primera` kept only its
 * noun senses and was defined as "first gear (lowest gear in a motor vehicle)". The reader
 * gets a real word explained by its rarest meaning.
 *
 * The morphology test is what makes this safe to act on. A lemma ending in `-o` is never a
 * Spanish or French infinitive, so this cannot catch the traps that have bitten every other
 * rule here: `casa` is a form of `casar`, `libro` of `librar`, `agua` of `aguar`, and all
 * three lemmas end in `-r`. Only genuine adjective/noun gender pairs match.
 */
function isFeminineOfOLemma(form, lemma) {
  if (!lemma.endsWith('o')) return false;
  const stem = lemma.slice(0, -1);
  return form === stem + 'a' || form === stem + 'as' || form === stem + 'os';
}

/** First `;`-separated sense, which is what the UI shows first. */
const lead = (g) => g.split(';')[0].trim();

const CLASSES = {
  empty:        'gloss is empty or whitespace',
  leadMeta:     'leading sense describes the spelling, not the word',
  anyMeta:      'some sense describes the spelling',
  properNoun:   'gloss is a bare proper-noun marker',
  grammarOnly:  'gloss is only a grammatical note, no meaning',
  formOrphan:   'feminine/plural of an -o lemma, missing the lemma\'s own sense',
};

/** "(name) María" and friends — the generator's marker, and Wiktionary leftovers. */
const PROPER = /^\s*\((?:name|proper noun)\)/i;
/** A gloss that only says what the word IS grammatically. */
const GRAMMAR_ONLY = /^(?:(?:contraction|compound|apocopic form|clipping|synonym|alternative case form|eye dialect|superseded form) of|used (?:to|in|as|with)\b|indicates\b|forms the\b)/i;

async function loadDict(rel, get) {
  const data = JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));
  const out = new Map();
  for (const [word, entry] of Object.entries(data)) out.set(word, get(entry) ?? '');
  return out;
}

const TARGETS = [
  { lang: 'zh', label: 'Chinese  (cedict)', file: 'public/cedict.json', get: e => e.m,       forms: null },
  { lang: 'ja', label: 'Japanese (jmdict)', file: 'public/jmdict.json', get: e => e.m,       forms: null },
  { lang: 'es', label: 'Spanish  (esdict)', file: 'public/esdict.json', get: e => e.m,       forms: 'lib/data/es-forms.json' },
  { lang: 'fr', label: 'French   (frdict)', file: 'public/frdict.json', get: e => e.m,       forms: 'lib/data/fr-forms.json' },
  { lang: 'es', label: 'Spanish  (A1–C2 table)', file: 'lib/data/cefr-vocab.json', get: e => e.meaning, forms: 'lib/data/es-forms.json' },
  { lang: 'fr', label: 'French   (A1–C2 table)', file: 'lib/data/fr-vocab.json',   get: e => e.meaning, forms: 'lib/data/fr-forms.json' },
];

let grandTotal = 0;
const grandFindings = Object.fromEntries(Object.keys(CLASSES).map(k => [k, 0]));

for (const t of TARGETS) {
  const dict = await loadDict(t.file, t.get);
  // A Map, not the raw object: `forms['constructor']` resolves against Object.prototype
  // and hands back a function, which is a real headword collision in every language here.
  const forms = t.forms ? new Map(Object.entries(require(path.join(ROOT, t.forms)))) : null;

  const found = Object.fromEntries(Object.keys(CLASSES).map(k => [k, []]));

  for (const [word, gloss] of dict) {
    if (!gloss || !gloss.trim()) { found.empty.push([word, gloss]); continue; }
    const parts = gloss.split(';').map(s => s.trim()).filter(Boolean);

    if (isMetalinguisticGloss(lead(gloss))) found.leadMeta.push([word, gloss]);
    else if (parts.some(p => isMetalinguisticGloss(p))) found.anyMeta.push([word, gloss]);

    if (PROPER.test(gloss)) found.properNoun.push([word, gloss]);
    if (parts.every(p => GRAMMAR_ONLY.test(p))) found.grammarOnly.push([word, gloss]);

    // The `primera` class needs the lemma to be a headword we can compare against.
    const lemma = forms?.get(word);
    if (lemma && isFeminineOfOLemma(word, lemma)) {
      const lemmaGloss = dict.get(lemma);
      if (lemmaGloss) {
        // Does this form already carry any of the lemma's senses? Compare on content words
        // so "first" inside "first gear" doesn't count as the ordinal sense being present.
        const mine = new Set(gloss.toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean));
        const theirs = lead(lemmaGloss).toLowerCase().split(/[^a-zà-ÿ]+/).filter(w => w.length > 2);
        const shared = theirs.filter(w => mine.has(w)).length;
        if (theirs.length > 0 && shared === 0) found.formOrphan.push([word, gloss, lemma, lemmaGloss]);
      }
    }
  }

  console.log(`\n${t.label}  —  ${dict.size.toLocaleString()} entries`);
  for (const [k, desc] of Object.entries(CLASSES)) {
    const n = found[k].length;
    grandFindings[k] += n;
    const pct = ((n / dict.size) * 100).toFixed(3);
    console.log(`  ${n === 0 ? '·' : '!'} ${String(n).padStart(6)}  ${pct.padStart(7)}%  ${k.padEnd(12)} ${desc}`);
    if (LIST === k && n > 0) {
      for (const row of found[k].slice(0, LIMIT)) {
        if (k === 'formOrphan') console.log(`        ${row[0]} = "${row[1]}"\n          (${row[2]} = "${lead(row[3])}")`);
        else console.log(`        ${row[0]} = "${row[1]}"`);
      }
    }
  }
  grandTotal += dict.size;
}

console.log(`\n${'='.repeat(72)}`);
console.log(`${grandTotal.toLocaleString()} glosses audited`);
for (const [k, n] of Object.entries(grandFindings)) {
  console.log(`  ${String(n).padStart(6)}  ${k}`);
}
