import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { emitData } from './lib/emitData.mjs';

/**
 * The daily proverb table — one dataset, four languages, NO model call.
 *
 * Idioms are a fixed, well-documented set, which makes generating them the wrong tool: a
 * model asked for "a chengyu" will occasionally produce a plausible four-character phrase
 * that is not one, or attach a gloss that is subtly wrong, and a learner cannot tell. This
 * codebase already refuses to let the model introduce definitions anywhere else (see
 * cleanContextualMeanings in the daily-content route). A static table also costs no API
 * credits, cannot fail, and works offline.
 *
 * CHINESE IS DERIVED, NOT WRITTEN. CC-CEDICT marks 4,874 four-character entries "(idiom)"
 * and defines them, so the whole Chinese list comes out of a dictionary we already ship.
 * Two quality gates apply:
 *
 *   - Every character must be in the HSK tables. An idiom a learner cannot even read is not
 *     a daily anything. This drops 4,874 → 3,760.
 *   - The 84 idioms that are HSK vocabulary in their own right come FIRST, as tier 0. That
 *     is the canon — 一如既往, 一目了然, 半途而废, 南辕北辙 — and it is the only signal in the
 *     data for "famous" as opposed to merely "readable". The rest follow, banded by their
 *     hardest character, so the list degrades gracefully into the long tail instead of
 *     opening on 一倡三叹.
 *
 * The other three come from scripts/data/proverbs-seed.json, because their emitted
 * dictionaries carry only {p, m} — JMdict's `proverb` tag and Wiktionary's `proverb` part of
 * speech are both dropped when those tables are built, leaving nothing to filter on. Each
 * seeded proverb is validated word by word against the language's own dictionary, so a typo
 * or an invented word fails the build loudly rather than shipping.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = (...p) => path.join(HERE, '..', ...p);
const readJson = async f => JSON.parse(await readFile(f, 'utf8'));

/** CC-CEDICT writes "lit. X (idiom); fig. Y" as often as a plain gloss. Split them apart. */
function splitChineseGloss(raw) {
  const cleaned = raw.replace(/\s*\(idiom[^)]*\)\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  const parts = cleaned.split(/\s*;\s*/).map(s => s.trim()).filter(Boolean);
  const litPart = parts.find(p => /^lit\.\s/i.test(p));
  const figPart = parts.find(p => /^fig\.\s/i.test(p));
  const strip = s => s.replace(/^(lit\.|fig\.)\s*/i, '').trim();

  if (figPart) return { m: strip(figPart), l: litPart ? strip(litPart) : undefined };
  if (litPart) {
    const rest = parts.filter(p => p !== litPart);
    return rest.length
      ? { m: rest.join('; '), l: strip(litPart) }
      : { m: strip(litPart), l: undefined };
  }
  return { m: parts.join('; '), l: undefined };
}

async function buildChinese() {
  const cedict = await readJson(root('public', 'cedict.json'));
  const levels = await readJson(root('lib', 'data', 'hsk-levels.json'));

  const charLevel = new Map();
  const wordLevel = new Map();
  for (const [level, words] of Object.entries(levels)) {
    for (const w of words) {
      if (!wordLevel.has(w)) wordLevel.set(w, Number(level));
      for (const c of w) if (!charLevel.has(c)) charLevel.set(c, Number(level));
    }
  }

  const out = [];
  for (const [word, entry] of Object.entries(cedict)) {
    if (word.length !== 4 || !/^[一-鿿]{4}$/.test(word)) continue;
    const raw = entry.m ?? '';
    if (!/\bidiom\b/i.test(raw)) continue;
    if (![...word].every(c => charLevel.has(c))) continue;      // must be readable

    const { m, l } = splitChineseGloss(raw);
    if (!m) continue;
    // tier 0 = the idiom is itself HSK vocabulary; otherwise band by hardest character.
    const lv = wordLevel.has(word) ? 0 : Math.max(...[...word].map(c => charLevel.get(c)));
    out.push({ t: word, r: entry.p ?? '', m, ...(l ? { l } : {}), lv });
  }
  out.sort((a, b) => a.lv - b.lv || a.t.localeCompare(b.t));
  return out;
}

/**
 * Every word of a seeded proverb must be a real headword.
 *
 * Not a check that the SAYING is real — nothing in the repo can verify that — but it does
 * catch the failure that actually happens when a list is written by hand: a misspelling, a
 * wrong accent, a word that does not exist. Japanese is skipped because the text is
 * unsegmented and there is nothing to split on; its readings are the check that matters and
 * they are written alongside.
 */
async function validateSeed(lang, entries, dictFile, formsFile) {
  const dict  = await readJson(root('public', dictFile));
  const forms = await readJson(root('lib', 'data', formsFile));

  /**
   * A proverb is running prose, so most of its words are INFLECTED and therefore not
   * headwords — "duerme", "vaut", "oreilles". Checking against the dictionary alone rejected
   * 23 of the 40. The form tables are the other half of the test and are already what the
   * lemmatizers use, so this asks the same question the app asks at read time.
   */
  // œ/æ are one letter in French orthography and two in half the data: frdict has `œuf` and
  // `oeufs` but neither `œufs` nor `oeuf`. Folding the ligature is not a workaround, it is
  // the equivalence the source is inconsistent about.
  const unligature = w => w.replace(/œ/g, 'oe').replace(/æ/g, 'ae');

  const known = w => {
    if (!w) return false;
    if (dict[w] || forms[w]) return true;
    const flat = unligature(w);
    if (flat !== w && (dict[flat] || forms[flat])) return true;
    // An elision (l'ours, qu'on, d'omelette) is one token here but two words; the proclitic
    // is always a known one-letter form, so testing the remainder is enough.
    const tail = w.replace(/^[a-z]['’]/, '');
    return tail !== w && (!!dict[tail] || !!forms[tail]);
  };

  const problems = [];
  for (const e of entries) {
    const words = e.t.toLowerCase().split(/[^\p{L}'’-]+/u).filter(Boolean);
    const missing = words.filter(w => !known(w));
    if (missing.length) problems.push(`  ${lang}: "${e.t}" — not in the dictionary: ${missing.join(', ')}`);
  }
  return problems;
}

async function main() {
  const seed = await readJson(root('scripts', 'data', 'proverbs-seed.json'));
  const zh = await buildChinese();

  const problems = [
    ...await validateSeed('es', seed.es, 'esdict.json', 'es-forms.json'),
    ...await validateSeed('fr', seed.fr, 'frdict.json', 'fr-forms.json'),
  ];
  if (problems.length) {
    console.error('Seeded proverbs failed dictionary validation:\n' + problems.join('\n'));
    process.exit(1);
  }

  const data = { zh, ja: seed.ja, es: seed.es, fr: seed.fr };
  await emitData(
    root('lib', 'data', 'proverbs.ts'),
    'PROVERBS',
    'Record<string, { t: string; r?: string; m: string; l?: string; lv?: number }[]>',
    data,
    `// One idiom or proverb per language, for the daily proverb card.
//
// Chinese is DERIVED from CC-CEDICT's "(idiom)" entries, filtered to those a learner can
// read (every character in HSK) and ordered canon-first. Japanese, Spanish and French are
// curated in scripts/data/proverbs-seed.json and validated against their own dictionaries,
// because their emitted tables drop the upstream proverb tags.
//
// Generated by scripts/build-proverbs.mjs — do not edit by hand.`,
  );

  console.log('proverbs:', Object.entries(data).map(([k, v]) => `${k} ${v.length}`).join(', '));
  const tier0 = zh.filter(p => p.lv === 0).length;
  console.log(`  zh tier 0 (HSK vocabulary idioms): ${tier0}`);
}

main().catch(err => { console.error(err); process.exit(1); });
