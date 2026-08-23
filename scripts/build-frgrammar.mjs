/**
 * Emit the French grammar table: which slot each inflected form fills.
 *
 * Source is Lexique 3 (scripts/data/Lexique383.tsv, CC BY-SA 4.0), ALREADY VENDORED for
 * frequency ranking — see scripts/lib/lexique.mjs and ATTRIBUTION.md. Nothing new is
 * downloaded and no new licence is taken on; the columns this needs (`cgram`, `infover`,
 * `genre`, `nombre`, `lemme`) were simply never read before.
 *
 * ── EVERY SLOT IS KEPT, NOT THE FIRST ──
 * Lexique packs all of a form's readings into ONE row, ordered by mood code: `lève` is
 * `imp:pre:2s;ind:pre:1s;ind:pre:3s;sub:pre:1s`. Taking `[0]` looks reasonable and labels
 * every regular -er verb's commonest form an IMPERATIVE — `il mange` would read "imperative ·
 * 2nd person singular". Because the codes are interned, keeping all four slots instead of one
 * costs 0.02 MB, so the shortcut bought nothing and would have cost the one thing this feature
 * cannot get wrong. lib/frenchGrammar.ts then says only what the slots jointly determine.
 *
 * ── WHAT IS KEPT, AND WHY SO LITTLE ──
 *
 * - Only forms that DIFFER from their lemma. A word that is already its own dictionary form
 *   has nothing to explain — the popup is showing that entry — and keeping them would add
 *   47,342 rows to say nothing.
 * - INTERNED codes. POS, slots, gender and number are one `VER|ind:imp:3s||` string, and there
 *   are only 231 distinct combinations in the whole database against 95,352 readings, so each
 *   row stores one small integer instead of repeating the text.
 * - RAW codes. Decoding to English happens in lib/frenchGrammar.ts at render time, so the
 *   wording stays editable without a rebuild. See the note there.
 *
 * ── THE LEMMA IS STORED EVEN THOUGH THE TOKEN ALREADY CARRIES ONE ──
 * `baseForm` on the token comes from lib/server/frenchLemmatizer.ts, which reads WIKTIONARY;
 * this table reads LEXIQUE. Measured against each other they agree on 99.7% of the 500
 * commonest forms — but not all: we resolve `parait → paraitre` where Lexique says `parer`,
 * and pinning one source's slot to the other's lemma is how a confident wrong label gets
 * printed. Storing the lemma (+0.8 MB) lets the lookup REQUIRE the two to agree, so the line
 * can only appear when both analyses match. Interning the lemmas as well was measured and
 * saves 0.18 MB against 29,147 distinct values — not worth the indirection.
 *
 * ~2.7 MB, fetched lazily on the first word tap and never at module scope. For scale the app
 * already fetches a 4.7 MB French dictionary as a matter of course.
 *
 * Usage: node scripts/build-frgrammar.mjs
 */
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { emitData } from './lib/emitData.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEXIQUE = path.join(__dirname, 'data', 'Lexique383.tsv');
const OUT = path.join(__dirname, '..', 'lib', 'data', 'fr-grammar.ts');

/** Categories that are vocabulary. Mirrors the intent of CONTENT_CGRAM in lib/lexique.mjs. */
const KEEP_POS = /^(VER|AUX|NOM|ADJ|ADV|PRE|PRO|CON|ART|ONO)/;

async function main() {
  const text = await readFile(LEXIQUE, 'utf8');
  const rows = text.split('\n');
  const header = rows[0].split('\t');
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const needed of ['ortho', 'lemme', 'cgram', 'infover', 'genre', 'nombre', 'islem']) {
    if (col[needed] === undefined) throw new Error(`Lexique is missing the ${needed} column`);
  }

  /** @type {Map<string, {lemma: string, code: string}[]>} */
  const raw = new Map();
  let seen = 0;

  for (let i = 1; i < rows.length; i++) {
    const c = rows[i].split('\t');
    if (c.length <= col.islem) continue;
    seen++;

    if (c[col.islem] === '1') continue;                 // the form IS the lemma
    const form = (c[col.ortho] ?? '').trim().toLowerCase();
    const lemma = (c[col.lemme] ?? '').trim();
    let pos = (c[col.cgram] ?? '').trim();
    if (!form || !lemma || !KEEP_POS.test(pos)) continue;
    if (form === lemma.toLowerCase()) continue;         // nothing to explain

    // AUX is a sub-category of VER, not a different word: `fut` is listed as both the
    // auxiliary and the verb `être` filling the same slot, which is one fact written twice
    // and would render as two identical lines. Folding it in makes them dedupe.
    if (pos.startsWith('AUX')) pos = 'VER' + pos.slice(3);

    // Lexique repeats slots within a row — one entry lists `par:pas` five times, another the
    // whole set twice. Deduping here takes 187 distinct codes to 159 and changes no output.
    const slots = [...new Set((c[col.infover] ?? '').split(';').filter(Boolean))].join(';');
    const code = [pos, slots, (c[col.genre] ?? '').trim(), (c[col.nombre] ?? '').trim()].join('|');

    let entries = raw.get(form);
    if (!entries) { entries = []; raw.set(form, entries); }
    if (entries.some(e => e.lemma === lemma && e.code === code)) continue;
    entries.push({ lemma, code });
  }

  const codes = [...new Set([...raw.values()].flat().map(e => e.code))].sort();
  const idx = new Map(codes.map((c, i) => [c, i]));

  /** @type {Record<string, [number, string][]>} */
  const words = {};
  for (const [form, entries] of raw) words[form] = entries.map(e => [idx.get(e.code), e.lemma]);

  const forms = Object.keys(words).length;
  const readings = Object.values(words).reduce((n, v) => n + v.length, 0);

  await emitData(
    OUT,
    'FR_GRAMMAR',
    '{ c: string[]; w: Record<string, [code: number, lemma: string][]> }',
    { c: codes, w: words },
    `// French inflection table — which grammatical slot each form fills.
//
// Generated by scripts/build-frgrammar.mjs from Lexique 3 (CC BY-SA 4.0), which is vendored
// at scripts/data/Lexique383.tsv for frequency ranking. See ATTRIBUTION.md.
//
//   { c: grammar codes, w: form -> [[codeIndex, lemma], ...] }
//
// A code is "POS|slots|gender|number", e.g. "VER|ind:imp:3s||" or "ADJ||f|s". Slots are every
// reading Lexique lists for the form, not the first — see the build script on why that matters.
// The lemma is stored so a lookup can require it to match the token's own baseForm, since the
// two come from different sources.
//
// Codes are raw; lib/frenchGrammar.ts turns them into English at render time so the wording
// can change without regenerating this file.
//
// ${forms.toLocaleString()} forms, ${readings.toLocaleString()} readings, ${codes.length} distinct codes, from ${seen.toLocaleString()} Lexique rows.`,
  );

  console.log(`Wrote ${OUT}`);
  console.log(`  ${forms.toLocaleString()} forms, ${readings.toLocaleString()} readings, ${codes.length} codes`);
}

main().catch(err => { console.error(err); process.exit(1); });
