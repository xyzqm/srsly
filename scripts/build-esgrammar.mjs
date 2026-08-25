/**
 * Emit the Spanish grammar table: which slot each inflected form fills.
 *
 * The Spanish counterpart of scripts/build-frgrammar.mjs, and deliberately a SEPARATE script
 * from build-esdict.mjs even though both read the same Wiktionary extract. Rebuilding the
 * dictionary also re-downloads and re-ranks four frequency corpora and would rewrite every
 * Spanish band; this needs none of that and must not put the level tables at risk to add a
 * grammar line.
 *
 * ── THE DATA IS A TAG SET, NOT A CODE ──
 * French comes from Lexique 3, whose `infover` packs mood, tense and person into one string
 * where `imp` means different things by POSITION. Wiktionary tags Spanish semantically instead:
 *
 *   hablaba → ['first-person', 'imperfect', 'indicative', 'singular', 'third-person']
 *   hablado → ['participle', 'past']
 *   casas   → ['feminine', 'plural'] of casa, AND ['present', 'second-person'] of casar
 *
 * That is a flat set, so there is no positional ambiguity to guard against and the decoder in
 * lib/spanishGrammar.ts is simpler than the French one. What DOES carry over is that a single
 * form routinely holds several readings at once — `hablaba` is both first and third person —
 * so the renderer still says only what the tags jointly determine.
 *
 * ── WHAT IS KEPT ──
 * - Only `form_of` senses, and only where the form differs from its lemma. A word that is its
 *   own dictionary form has nothing to explain; the popup is already showing that entry.
 * - INTERNED codes, for the same reason as French: a few hundred distinct tag combinations
 *   against hundreds of thousands of readings.
 * - The lemma on every reading, so a lookup can require it to match the token's own `baseForm`.
 *   Both sides come from Wiktionary here, so they agree far more often than the French pair
 *   did — but `casas` is a form of BOTH `casa` and `casar`, and the lemma is the only thing
 *   that says which one the sentence meant.
 *
 * ── WHY IT IS FILTERED, AND TO WHAT ──
 * Unfiltered this is 669,076 forms and 22.6 MB, because Wiktionary conjugates every verb it
 * has — `recapitalizaríamos` and all. Only 7% of those forms appear in `es-forms.json`, which
 * is what the app's own lemmatizer reads, so the rest can never produce a matching `baseForm`
 * and the grammar line could never fire for them: 15 MB of table that cannot render.
 *
 * So a form is kept when its lemma is GRADED VOCABULARY (the 12,000 words in cefr-vocab, which
 * is the app's own notion of vocabulary worth levelling) or when the form is one the lemmatizer
 * table already knows, which keeps the irregulars of anything. That is 134k forms and 4.35 MB —
 * the same order as the French table's 2.70 MB, against an esdict.json of 5.45 MB that every
 * Spanish learner already downloads.
 *
 * Usage: node scripts/build-esgrammar.mjs   (after build-esdict.mjs)
 */
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { emitData } from './lib/emitData.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'lib', 'data', 'es-grammar.ts');
const KAIKKI_URL = 'https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl';

/** Categories that carry vocabulary a reader taps. */
const KEEP_POS = new Set(['verb', 'noun', 'adj', 'adv', 'pron', 'det', 'prep', 'conj', 'article']);

/**
 * The tags that describe a grammatical SLOT — a WHITELIST, not a blacklist.
 *
 * Wiktionary's Spanish tags have a long, open-ended tail: twenty-odd country names
 * (`Mexico`, `Rioplatense`, `Canary-Islands`), lexical relations (`abbreviation`, `clipping`,
 * `misspelling`, `pronunciation-spelling`), syntax (`transitive`, `pronominal`) and register.
 * Blacklisting them was tried first and is unwinnable: anything missed fragments the interned
 * code space — the first build produced 957 codes, most of them a real slot plus a country.
 *
 * A whitelist inverts that. Only these tags can enter a code, so an unfamiliar tag is ignored
 * rather than silently becoming part of the grammar, and a reading with none of them is
 * dropped as saying nothing about inflection.
 */
const GRAMMAR_TAGS = new Set([
  // person and number
  'first-person', 'second-person', 'third-person', 'singular', 'plural',
  // gender, which Spanish nouns and adjectives carry
  'masculine', 'feminine', 'neuter',
  // mood and tense. `indicative` is kept in the DATA and dropped at render, where the
  // decision about what is worth saying belongs.
  'indicative', 'subjunctive', 'imperative', 'conditional',
  'present', 'past', 'imperfect', 'preterite', 'future',
  // non-finite
  'participle', 'gerund', 'infinitive',
  // the voseo conjugation, which is a real slot a reader of Rioplatense text will meet
  'with-voseo',
  // degree
  'superlative', 'comparative', 'diminutive', 'augmentative',
]);

function curlStream(url) {
  return spawn('curl', ['-sL', '--max-time', '1800', url], { stdio: ['ignore', 'pipe', 'inherit'] });
}

/** The two tables that decide which forms are worth carrying — see the note above. */
async function loadKeepSets() {
  const read = async rel => JSON.parse(await readFile(path.join(__dirname, '..', rel), 'utf8'));
  const [vocab, forms] = await Promise.all([
    read('lib/data/cefr-vocab.json'),
    read('lib/data/es-forms.json'),
  ]);
  return { graded: new Set(Object.keys(vocab)), known: new Set(Object.keys(forms)) };
}

async function main() {
  const { graded, known } = await loadKeepSets();
  console.log(`  keeping forms of ${graded.size.toLocaleString()} graded lemmas, plus ${known.size.toLocaleString()} known forms`);
  console.log('Streaming Wiktionary extract from', KAIKKI_URL, '(~1 GB, a few minutes) ...');
  const proc = curlStream(KAIKKI_URL);
  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });

  /** @type {Map<string, {lemma: string, code: string}[]>} */
  const raw = new Map();
  let lines = 0, readings = 0;

  for await (const line of rl) {
    if (!line) continue;
    lines++;
    if (lines % 250_000 === 0) console.log(`  ${lines.toLocaleString()} lines…`);

    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.lang_code !== 'es' || typeof e.word !== 'string') continue;

    const pos = (e.pos ?? '').trim();
    if (!KEEP_POS.has(pos)) continue;

    const form = e.word.trim().toLowerCase();
    if (!form || !/[a-záéíóúüñ]/i.test(form)) continue;

    for (const s of e.senses ?? []) {
      // `form_of` only. `alt_of` is an alternative SPELLING (`aun`/`aún`, abbreviations,
      // misspellings), which is not a grammatical slot and has no place on this line.
      const lemma = s.form_of?.[0]?.word;
      if (typeof lemma !== 'string') continue;
      const lem = lemma.trim().toLowerCase();
      if (!lem || lem === form) continue;                 // nothing to explain

      // A form the app can never resolve to this lemma cannot render a line — see the note
      // at the top on why that is 93% of the raw table.
      if (!graded.has(lem) && !known.has(form)) continue;

      const tags = [...new Set((s.tags ?? []).filter(t => GRAMMAR_TAGS.has(t)))].sort();
      if (!tags.length) continue;                          // a bare "form of X" says nothing

      const code = `${pos}|${tags.join(',')}`;
      let entries = raw.get(form);
      if (!entries) { entries = []; raw.set(form, entries); }
      if (entries.some(x => x.lemma === lem && x.code === code)) continue;
      entries.push({ lemma: lem, code });
      readings++;
    }
  }

  const exit = await new Promise(res => proc.on('close', res));
  if (exit !== 0) throw new Error(`curl exited ${exit}`);
  if (!raw.size) throw new Error('no forms parsed — the extract format may have changed');

  const codes = [...new Set([...raw.values()].flat().map(e => e.code))].sort();
  const idx = new Map(codes.map((c, i) => [c, i]));

  /** @type {Record<string, [number, string][]>} */
  const words = {};
  for (const [form, entries] of raw) words[form] = entries.map(e => [idx.get(e.code), e.lemma]);

  await emitData(
    OUT,
    'ES_GRAMMAR',
    '{ c: string[]; w: Record<string, [code: number, lemma: string][]> }',
    { c: codes, w: words },
    `// Spanish inflection table — which grammatical slot each form fills.
//
// Generated by scripts/build-esgrammar.mjs from the Spanish Wiktionary extract at kaikki.org
// (CC BY-SA 4.0), the same source scripts/build-esdict.mjs reads. See ATTRIBUTION.md.
//
//   { c: grammar codes, w: form -> [[codeIndex, lemma], ...] }
//
// A code is "pos|tag,tag,tag" with the tags sorted, e.g. "verb|imperfect,indicative,singular".
// Unlike the French table these are semantic tags rather than positional codes, so there is no
// slot ordering to get wrong. The lemma is stored so a lookup can require it to match the
// token's own baseForm: \`casas\` is a form of both \`casa\` and \`casar\`.
//
// Tags are raw; lib/spanishGrammar.ts turns them into English at render time so the wording
// can change without regenerating this file.
//
// ${Object.keys(words).length.toLocaleString()} forms, ${readings.toLocaleString()} readings, ${codes.length} distinct codes, from ${lines.toLocaleString()} lines.`,
  );

  console.log(`Wrote ${OUT}`);
  console.log(`  ${Object.keys(words).length.toLocaleString()} forms, ${readings.toLocaleString()} readings, ${codes.length} codes`);
}

main().catch(err => { console.error(err); process.exit(1); });
