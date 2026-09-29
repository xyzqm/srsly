import { describe, it, expect } from 'vitest';
import { lemmatizeEs, type LemmaDict } from '@/lib/server/spanishLemmatizer';
import esdictData from '@dict/esdict.json';
import { CEFR_VOCAB } from '@/lib/data/cefr-vocab';
import CORE_OVERRIDES from '../scripts/data/core-overrides.json';

/**
 * The over-lemmatization guard is the rule worth pinning here. CLAUDE.md states it in prose:
 * a surface that is itself a common word short-circuits the suffix rules, because many
 * frequent Spanish words are also inflections of something else. Without it `mercado` becomes
 * a participle of `mercar` and `para` a form of `parar`.
 */

const esdict = esdictData as unknown as Record<string, { p: string; m: string }>;
const NAME_SENSE_RE = /\b(surname|given name|patronymic)\b|^an? [a-zé ]*\b(city|town|village|municipality|province|region|river|island)\b/i;

const dict: LemmaDict = {
  has: w => w in esdict || w in CEFR_VOCAB,
  isCommonWord(w) {
    const m = esdict[w]?.m ?? CEFR_VOCAB[w]?.meaning;
    if (!m) return false;
    return m.split('; ').some(s => s.trim() && !NAME_SENSE_RE.test(s.trim()));
  },
};

const lemma = (w: string) => lemmatizeEs(w, dict);

describe('a common word is never re-read as an inflection', () => {
  it.each([
    ['mercado', 'market, not a participle of mercar'],
    ['para',    'the preposition, not a form of parar'],
    ['casa',    'house, though Wiktionary lists it as a form of casar'],
    ['agua',    'water, though listed as a form of aguar'],
  ])('%s — %s', w => expect(lemma(w)).toBeUndefined());
});

describe('irregulars come from the form table', () => {
  it.each([
    ['dijeron', 'decir'],
    ['duerme',  'dormir'],
    ['tuve',    'tener'],
    ['vende',   'vender'],   // not `vendar` — see the tie-break below
  ])('%s → %s', (w, want) => expect(lemma(w)).toBe(want));
});

/**
 * WHEN A FORM BELONGS TO TWO LEMMAS, the commoner one wins — `es-forms` used to keep whichever
 * Wiktionary emitted first, which handed `vende` to `vendar` ("to bandage") rather than `vender`
 * ("to sell") and defined the verb in "el hombre que vende las naranjas" as bandaging.
 *
 * `fui` is the honest cost of that rule and is pinned here so the trade stays visible. It is the
 * preterite of BOTH `ser` and `ir` — genuinely, not as an artefact — so "fui profesor" and "fui
 * al mercado" are the same word doing two jobs. Frequency picks `ser`, which is right about as
 * often as it is wrong; unlike `vende`, there is no reading here that is simply incorrect.
 */
describe('a form shared by two lemmas resolves to the commoner one', () => {
  it('gives the ser/ir preterite to ser', () => {
    for (const w of ['fui', 'fue', 'fuiste', 'fueron']) expect(lemma(w), w).toBe('ser');
  });
});

describe('regular inflections resolve by suffix rule', () => {
  it.each([
    ['hablamos', 'hablar'],
    ['comiendo', 'comer'],
    ['vivieron', 'vivir'],
  ])('%s → %s', (w, want) => expect(lemma(w)).toBe(want));
});

describe('plurals reach their singular', () => {
  it.each([
    ['casas',  'casa'],
    ['libros', 'libro'],
  ])('%s → %s', (w, want) => expect(lemma(w)).toBe(want));
});

/**
 * The hand-written glosses actually reach the shipped tables — and are not stale.
 *
 * `curatedGloss` is the ONE place this project writes a definition itself rather than taking
 * it from the licensed source, so it earns a check. Two failure modes, both already recorded
 * in CLAUDE.md about its sibling `leadSense`: an entry that silently does nothing, and an
 * entry naming a word the dictionary no longer has, which sits in the file looking applied.
 */
describe('curated Spanish glosses are applied and none has gone stale', () => {
  const dict = esdictData as unknown as Record<string, { m?: string }>;
  const curated = (CORE_OVERRIDES as { curatedGloss: { es: Record<string, string> } }).curatedGloss.es;

  it.each(Object.entries(curated))('%s ships the curated text verbatim', (word, gloss) => {
    expect(dict[word]?.m).toBe(gloss);
  });

  /**
   * `gustar` specifically, because it is the reason the section grew. Wiktionary's own lead
   * sense reads `translated as "to like", analyzable in structure as "to please" [with dative
   * 'someone']` — a linguist's note handed to a beginner as the definition of the first verb
   * they meet. `leadSense` could not fix it: there is no plain "to like" sense to promote,
   * that IS the sense.
   */
  it('gustar leads with the meaning, not with a note about dative structure', () => {
    const g = dict['gustar']?.m ?? '';
    expect(g.split(';')[0]).toBe('to like (literally, to be pleasing to)');
    expect(g).not.toMatch(/analyzable/);
    // The secondary sense survives: a curated gloss REPLACES, and a deleted sense is wrong.
    expect(g).toMatch(/to taste/);
  });
});

/**
 * AND ITS SIBLING `leadSense` HAD NO SUCH CHECK AT ALL, WHICH IS HOW ONE GOT DECLARED AND
 * NEVER APPLIED.
 *
 * CLAUDE.md records two ways a `leadSense` entry silently does nothing — `rouge`, which
 * matched at index 0 and skipped its own move, and `ci`, which named a sense that no longer
 * survives filtering — and then the fix for both was verified by reading the build output
 * once. `curatedGloss` got a standing test above; `leadSense` did not, so nothing noticed
 * when two entries were added against a table that had not been rebuilt.
 *
 * ── THE PENDING LIST IS THE POINT, NOT A GET-OUT ──
 * `scripts/repin-levels.mjs` deliberately cannot reach `leadSense`: gloss order is decided
 * BEFORE the anchor, which reads it, so applying one after the fact would give a different
 * answer from a rebuild and break the property that makes repin safe. So an entry added
 * without a rebuild is legitimately unapplied for a while — and must be NAMED, exactly as
 * `KNOWN_DICTIONARY_GAPS` names the lesson words that do not resolve. The list is asserted to
 * be EXACTLY right in both directions, so it cannot outlive the rebuild that clears it, and a
 * new unapplied entry cannot hide inside it.
 */
describe('every leadSense entry is applied, or is named as awaiting a rebuild', () => {
  const dict = esdictData as unknown as Record<string, { m?: string }>;
  const leads = (CORE_OVERRIDES as { leadSense: { es: Record<string, string> } }).leadSense.es;

  /** Added against a table that has not been rebuilt since. Clear these ON the next rebuild. */
  const PENDING_REBUILD = ['pastel', 'mientras'];

  const applied = (word: string, want: string) => {
    const lead = (dict[word]?.m ?? '').split(';')[0].trim();
    // Exact first, substring second — the same order `coreOverrides.mjs` matches in.
    return lead === want || lead.includes(want);
  };

  const unapplied = Object.entries(leads).filter(([w, v]) => !applied(w, v)).map(([w]) => w);

  it('names exactly the entries that have not shipped — no more, no fewer', () => {
    expect(unapplied.sort()).toEqual([...PENDING_REBUILD].sort());
  });

  it.each(Object.entries(leads).filter(([w]) => !PENDING_REBUILD.includes(w)))(
    '%s leads the shipped gloss', (word, want) => {
      expect(applied(word, want)).toBe(true);
    });
});
