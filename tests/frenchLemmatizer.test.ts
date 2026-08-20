import { describe, it, expect } from 'vitest';
import { lemmatizeFr, type LemmaDict } from '@/lib/server/frenchLemmatizer';
import frdictData from '@dict/frdict.json';
import { FR_VOCAB } from '@/lib/data/fr-vocab';

/**
 * The homograph and elision rules are the whole reason this module exists, and until now they
 * were asserted only in prose — in CLAUDE.md and in comments. Every case below is one the
 * codebase has an opinion about and would regress silently if a suffix rule were reordered.
 *
 * The real dictionary is used deliberately. These rules are claims ABOUT that data ("`est` is
 * a headword meaning east, which is why peeling `n'est` needs a second pass"), so a stub
 * would test the regex and not the behaviour.
 */

const frdict = frdictData as unknown as Record<string, { p: string; m: string }>;
const NAME_SENSE_RE = /\b(surname|given name|patronymic)\b|^an? [a-zé ]*\b(city|town|village|commune|department|province|region|river|island)\b/i;

const dict: LemmaDict = {
  has: w => w in frdict || w in FR_VOCAB,
  isCommonWord(w) {
    const m = frdict[w]?.m ?? FR_VOCAB[w]?.meaning;
    if (!m) return false;
    return m.split('; ').some(s => s.trim() && !NAME_SENSE_RE.test(s.trim()));
  },
};

const lemma = (w: string) => lemmatizeFr(w, dict);

describe('a surface that is its own headword stays put', () => {
  // undefined means "this IS a dictionary form" — the caller omits RawTok's 4th element.
  it.each([
    ['livre', 'book, not a form of livrer'],
    ['porte', 'door, not a form of porter'],
    ['ferme', 'farm, not a form of fermer'],
    ['vers', 'toward, not a form of verser'],
  ])('%s — %s', w => expect(lemma(w)).toBeUndefined());
});

describe('FORM_DOMINANT_LEMMAS override that, for a dozen very common verbs', () => {
  it.each([
    ['est',  'être'],   // the noun "east" exists and must not win
    ['été',  'être'],   // "summer" exists and must not win
    ['suis', 'être'],
    ['ai',   'avoir'],
    ['fait', 'faire'],
  ])('%s → %s', (w, want) => expect(lemma(w)).toBe(want));

  it('puis is the everyday adverb, not a literary form of pouvoir', () => {
    expect(lemma('puis')).toBeUndefined();
  });
});

describe('elision', () => {
  it.each([
    ["l'eau",   'eau'],
    // Stops at `une` rather than going on to `un`: the peeled remainder is itself a
    // headword, and the module's rule is that a surface which is a word stays put.
    ["d'une",   'une'],
    ["qu'il",   'il'],
    ["n'est",   'être'],   // peels to `est`, a headword meaning "east" — needs the second pass
  ])('%s → %s', (w, want) => expect(lemma(w)).toBe(want));

  it.each([
    ["aujourd'hui", 'a headword in its own right'],
    ["d'accord",    'means OK, not "of agreement"'],
  ])('%s is never split — %s', w => expect(lemma(w)).toBeUndefined());

  it('the typographic apostrophe behaves exactly like the typewriter one', () => {
    for (const [straight, curly] of [["l'eau", 'l’eau'], ["qu'il", 'qu’il'], ["n'est", 'n’est']]) {
      expect(lemma(curly)).toBe(lemma(straight));
    }
    // These are headwords keyed with U+0027; pasted prose writes U+2019.
    expect(lemma('d’accord')).toBeUndefined();
    expect(lemma('aujourd’hui')).toBeUndefined();
  });
});

describe('ligature plurals resolve to the noun, not a homographic verb', () => {
  // Lexique writes no œ at all, so these were absent from FR_FORMS and fell through to the
  // suffix rules, which try verb endings first: œuvres → œuvrer "to work".
  it.each([
    ['œufs',      'œuf'],
    ['œuvres',    'œuvre'],
    ['manœuvres', 'manœuvre'],
    ['vœux',      'vœu'],
    ['nœuds',     'nœud'],
    ['cœurs',     'cœur'],
    ['sœurs',     'sœur'],
  ])('%s → %s', (w, want) => expect(lemma(w)).toBe(want));

  it('ordinary plurals are unaffected', () => {
    expect(lemma('portes')).toBe('porte');
    expect(lemma('livres')).toBe('livre');
    expect(lemma('voitures')).toBe('voiture');
  });
});

describe('inflections resolve through the form table', () => {
  it.each([
    ['mangé',    'manger'],
    ['mangeait', 'manger'],
    ['allons',   'aller'],
    ['belles',   'beau'],
  ])('%s → %s', (w, want) => expect(lemma(w)).toBe(want));
});
