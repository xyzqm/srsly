import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'core-overrides.json');

/**
 * Hand-pinned level-1 vocabulary.
 *
 * WHY A MANUAL LIST EXISTS AT ALL
 * Everything else in this pipeline is derived — cross-register frequency decides the
 * ordering, the CEFR-J anchor nudges it. Both are blind to the same thing: nobody writes
 * "hello" in an encyclopedia. Measured against the corpora we actually use, `hola` and
 * `bonjour` landed at B1, `안녕하세요` and `아니요` at B2, and `por favor`, `s'il vous plaît`,
 * `au revoir` and `여보세요` were never ranked at all, because the corpus tokenizer counts
 * single tokens and those are multi-word. No amount of tuning fixes that: the evidence is
 * missing from the source, not weighted wrongly.
 *
 * So this file is the deliberate escape hatch, and it is kept small on purpose. It is not
 * a place to express taste about what belongs in A1 — it is for vocabulary whose absence
 * from a beginner curriculum would be indefensible, and which the corpora cannot see.
 *
 * The one rule the override does NOT bypass is the dictionary. A pinned word still has to
 * be a real headword with a real gloss, because the emitted tables carry the gloss and the
 * strict-dictionary policy holds everywhere: definitions come from the dictionary or they
 * do not exist. Anything unknown is warned about and skipped rather than invented.
 */

/** @returns {string[]} pinned headwords for `lang`, in the order they should appear */
export function coreOverridesFor(lang) {
  const all = JSON.parse(readFileSync(FILE, 'utf8'));
  const list = all[lang];
  return Array.isArray(list) ? list : [];
}

/**
 * Force every pinned word to level 1, ahead of everything frequency ranked there.
 *
 * Runs AFTER the CEFR-J adjustment and immediately before the tables are emitted, so a
 * pinned word is untouched by both the frequency cut and the anchor swap — which is the
 * whole point of pinning it.
 *
 * Band sizes are allowed to drift here, unlike everywhere else. Pinning is a claim that
 * the curriculum is wrong, and honouring it by demoting some other real word to keep A1 at
 * exactly 500 would trade one arbitrary decision for another. The drift is ~20 words in
 * 12,000 and is reported.
 *
 * @param {string} lang
 * @param {Record<number, string[]>} levels  band → words (mutated copy returned)
 * @param {(word: string) => boolean} inDict does the dictionary have a gloss for this word?
 * @returns {{ levels: Record<number, string[]>, pinned: string[], missing: string[], moved: Array<{word: string, from: number|null}> }}
 */
export function applyCoreOverrides(lang, levels, inDict) {
  const words = coreOverridesFor(lang);
  if (!words.length) return { levels, pinned: [], missing: [], moved: [] };

  const out = {};
  for (const [b, ws] of Object.entries(levels)) out[b] = [...ws];

  const bandOf = new Map();
  for (const [b, ws] of Object.entries(out)) for (const w of ws) bandOf.set(w, Number(b));

  const pinned = [], missing = [], moved = [];
  for (const w of words) {
    if (!inDict(w)) { missing.push(w); continue; }
    const from = bandOf.get(w) ?? null;
    if (from !== null) out[from] = out[from].filter(x => x !== w);
    if (from !== 1) moved.push({ word: w, from });
    pinned.push(w);
  }

  // Prepended, in file order, so the pinned words are literally the first thing a learner
  // meets when they import level 1 — "sit at the top of the beginner curriculum" is the
  // requirement, and level lists are consumed in array order.
  out[1] = [...pinned, ...out[1].filter(w => !pinned.includes(w))];
  return { levels: out, pinned, missing, moved };
}

const CODE = { 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2', 5: 'C1', 6: 'C2' };

/** Summarise an override pass on stdout. */
export function reportCoreOverrides(result, levelSizeBefore) {
  const { pinned, missing, moved, levels } = result;
  console.log(`  core overrides: ${pinned.length} pinned to level 1 (${moved.length} moved, ${pinned.length - moved.length} already there)`);
  if (moved.length) {
    console.log('    ' + moved.map(m => `${m.word}${m.from ? ` ${CODE[m.from]}→A1` : ' (was unranked)'}`).join('  '));
  }
  if (missing.length) {
    console.log(`    !! not in the dictionary, skipped: ${missing.join(' ')}`);
  }
  const after = levels[1].length;
  if (after !== levelSizeBefore) console.log(`    level 1 is now ${after} words (was ${levelSizeBefore})`);
}
