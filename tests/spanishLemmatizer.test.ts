import { describe, it, expect } from 'vitest';
import { lemmatizeEs, type LemmaDict } from '@/lib/server/spanishLemmatizer';
import esdictData from '@dict/esdict.json';
import { CEFR_VOCAB } from '@/lib/data/cefr-vocab';

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
