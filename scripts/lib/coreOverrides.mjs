import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'core-overrides.json');

/**
 * Hand-set level overrides — the two escape hatches from the frequency ranking.
 *
 *   pin     force to level 1
 *   demote  force no higher than DEMOTE_FLOOR
 *
 * WHY MANUAL LISTS EXIST AT ALL
 * Everything else in this pipeline is derived: frequency decides the ordering and the
 * CEFR-J anchor nudges it. Both are blind in the same two directions, and in both cases
 * the evidence is missing from the source rather than weighted wrongly, so no amount of
 * tuning recovers it.
 *
 *   Nobody writes "hello" in an encyclopedia. `hola` and `bonjour` landed at B1, and
 *   `por favor` / `s'il vous plaît` were never ranked at all, being multi-word where the
 *   tokenizer counts single tokens. Nor does anyone write "fork", "Thursday", "purple" or
 *   "yogurt" often: `tenedor`, `zumo` and `verdura` reached C2, `bolígrafo` C1, `cuchillo`
 *   B2, three of the seven weekdays B1. Against an external A1 reference only 49% of a
 *   real beginner vocabulary was in our A1 — hence the thematic `beginner` sets.
 *
 *   Narrative fiction is full of death. French ranks off Lexique, whose two registers are
 *   film subtitles and books, so `mourir`, `tuer`, `guerre` and `sang` are genuinely
 *   frequent and land in A1 on merit.
 *
 * Both lists are kept short on purpose. They are not a place to express taste about what
 * belongs in A1 — they are for the two specific failures above.
 *
 * The one rule neither override bypasses is the dictionary. A listed word still has to be
 * a real headword with a real gloss, because the emitted tables carry that gloss and the
 * strict-dictionary policy holds everywhere: definitions come from the dictionary or they
 * do not exist. Anything unknown is warned about and skipped rather than invented.
 */

const CODE = { 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2', 5: 'C1', 6: 'C2' };

/** Bands a demoted word may not sit above. 3 = B1. */
export const DEMOTE_FLOOR = 3;

function read(section, lang) {
  const all = JSON.parse(readFileSync(FILE, 'utf8'));
  const list = all?.[section]?.[lang];
  return Array.isArray(list) ? list : [];
}

/**
 * Headwords pinned to level 1 for `lang`, in the order they should appear: the greetings
 * first, then the thematic beginner sets.
 *
 * `beginner` is kept grouped by category in the JSON rather than flattened, because the
 * grouping is the point — it is a syllabus, and a future "study by topic" feature wants
 * exactly this shape. Flattening happens here, at the last moment.
 */
/**
 * Which of a word's own senses should lead, for the handful where Wiktionary's order
 * misleads. See the `_why` in core-overrides.json — the short version is that Wiktionary
 * glosses an abbreviation's expansion as an ordinary word ("northwest" for `no`), so no
 * test of the gloss text can tell it from a real meaning.
 *
 * A Map, not a plain object: dictionary words include `constructor` and `toString`, which
 * a plain-object lookup would resolve against Object.prototype.
 *
 * @param {string} lang
 * @returns {Map<string, string>}
 */
export function leadSenseFor(lang) {
  const prefs = JSON.parse(readFileSync(FILE, 'utf8')).leadSense?.[lang];
  return new Map(prefs && typeof prefs === 'object' ? Object.entries(prefs) : []);
}

/**
 * Hand-written glosses for entries the source is missing a core sense for — the one
 * deliberate exception to "a definition comes from the dictionary or it does not exist".
 * See the `_why` in core-overrides.json; prefer leadSenseFor whenever reordering suffices.
 *
 * @param {string} lang
 * @returns {Map<string, string>}
 */
export function curatedGlossFor(lang) {
  const g = JSON.parse(readFileSync(FILE, 'utf8')).curatedGloss?.[lang];
  return new Map(g && typeof g === 'object' ? Object.entries(g) : []);
}

export function coreOverridesFor(lang) {
  const all = JSON.parse(readFileSync(FILE, 'utf8'));
  const themed = Object.values(all?.beginner?.[lang] ?? {}).flat();
  const seen = new Set();
  return [...read('pin', lang), ...themed].filter(w => !seen.has(w) && seen.add(w));
}

/** @returns {string[]} headwords for `lang` that may not sit above DEMOTE_FLOOR */
export function demotionsFor(lang) { return read('demote', lang); }

/**
 * Push hand-listed words down to DEMOTE_FLOOR.
 *
 * WHY THIS IS A LIST AND NOT A FORMULA
 * The obvious fix for French A1 filling with `mourir`, `tuer`, `guerre` and `sang` is to
 * blend in a non-narrative register and let the arithmetic sort it out. That was measured,
 * and it inverts: Global Voices and Wikimedia rank `guerre` at 206/72 and `mort` at 144/78
 * — ABOVE where Lexique puts them — while ranking `bonjour` 4348/16922 and `merci` 1223/11506.
 * Conflict and death are core news and encyclopedia vocabulary; greetings are not. Every
 * weighting tried (mean, geometric, worst-of) left `mourir`/`tuer`/`guerre` in A1 and pushed
 * `bonjour` to B1–B2, `manger` and `chien` to A2. No monotone combination of those signals
 * can separate the two, because they are anti-correlated with the goal.
 *
 * So this is an editorial judgement stated as one, not a number pretending to be one.
 * Frequency is not WRONG about these words — they really are common — they are just not
 * what a beginner should meet first.
 *
 * Words are appended to the floor band, i.e. they become its lowest-priority members.
 *
 * @param {string} lang
 * @param {Record<number, string[]>} levels
 * @param {(word: string) => boolean} inDict
 * @returns {{ levels: Record<number, string[]>, moved: Array<{word: string, from: number}>, missing: string[] }}
 */
export function applyDemotions(lang, levels, inDict) {
  const words = demotionsFor(lang);
  if (!words.length) return { levels, moved: [], missing: [] };

  const out = {};
  for (const [b, ws] of Object.entries(levels)) out[b] = [...ws];
  const bandOf = new Map();
  for (const [b, ws] of Object.entries(out)) for (const w of ws) bandOf.set(w, Number(b));

  const moved = [], missing = [];
  for (const w of words) {
    if (!inDict(w)) { missing.push(w); continue; }
    const from = bandOf.get(w);
    if (from === undefined || from >= DEMOTE_FLOOR) continue;   // already deep enough
    out[from] = out[from].filter(x => x !== w);
    out[DEMOTE_FLOOR].push(w);
    moved.push({ word: w, from });
  }
  return { levels: out, moved, missing };
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


/** Summarise a demotion pass on stdout. */
export function reportDemotions(result) {
  const { moved, missing } = result;
  console.log(`  demotions: ${moved.length} word(s) pushed to ${CODE[DEMOTE_FLOOR]}`);
  if (moved.length) console.log('    ' + moved.map(m => `${m.word} ${CODE[m.from]}→${CODE[DEMOTE_FLOOR]}`).join('  '));
  if (missing.length) console.log(`    !! not in the dictionary, skipped: ${missing.join(' ')}`);
}

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
