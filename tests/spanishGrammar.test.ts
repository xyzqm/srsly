import { describe, it, expect } from 'vitest';
import { ES_GRAMMAR } from '@/lib/data/es-grammar';
import { describeCode, lookupGrammar, type EsGrammarTable } from '@/lib/spanishGrammar';

/**
 * Against the REAL emitted table, deliberately — the same reasoning as the French grammar and
 * lemmatizer tests. The claims here are about the data Wiktionary actually produces, so a stub
 * would test the arithmetic instead.
 */
const table = ES_GRAMMAR as EsGrammarTable;

describe('the phrasing is what a learner needs', () => {
  it.each([
    ['verb|imperfect,indicative,singular,third-person', 'imperfect · 3rd person singular'],
    ['verb|first-person,indicative,preterite,singular', 'preterite · 1st person singular'],
    ['verb|indicative,present,second-person,singular', 'present · 2nd person singular'],
    ['verb|future,indicative,singular,third-person', 'future · 3rd person singular'],
    ['verb|present,singular,subjunctive,third-person', 'subjunctive present · 3rd person singular'],
    ['verb|conditional,plural,third-person', 'conditional · 3rd person plural'],
    ['verb|participle,past', 'past participle'],
    ['verb|gerund', 'gerund'],
    ['noun|feminine,plural', 'feminine plural'],
    ['adj|masculine,singular', 'masculine singular'],
  ])('%s reads as "%s"', (code, expected) => {
    expect(describeCode(code)).toBe(expected);
  });

  /**
   * The indicative is the unmarked mood. Naming it adds a word to almost every verb and tells
   * the reader nothing they can act on.
   */
  it('never says "indicative"', () => {
    for (const c of table.c) expect(describeCode(c) ?? '').not.toMatch(/indicative/i);
  });

  it('returns null rather than guessing at nonsense', () => {
    for (const c of ['', 'verb|', 'noun|', 'verb|zzz', '|||']) {
      expect(describeCode(c), c).toBeNull();
    }
  });
});

/**
 * THE REGRESSION THIS SUITE EXISTS FOR. One Spanish spelling routinely does several jobs, and
 * naming whichever tag sorted first is a coin flip presented to a beginner as a fact.
 */
describe('an axis is only named when its tags agree', () => {
  it('drops the person when a form is both first and third', () => {
    // `hablaba` is "I was speaking" AND "he was speaking".
    const line = describeCode('verb|first-person,imperfect,indicative,singular,third-person');
    expect(line).toBe('imperfect · singular');
    expect(line).not.toMatch(/person/);
  });

  it('drops the gender when a form serves both', () => {
    // This rendered as "feminine" before the fix, which is simply untrue of the form.
    expect(describeCode('adj|augmentative,feminine,masculine')).toBe('augmentative');
    expect(describeCode('adj|augmentative,feminine,masculine')).not.toMatch(/feminine|masculine/);
  });

  it('says nothing at all when only a contradiction is left', () => {
    expect(describeCode('noun|feminine,masculine')).toBeNull();
  });

  /**
   * Two tenses is not a contradiction but a real fact about Spanish: for -ir verbs the first
   * person plural is spelled the same in the present and the preterite, so `vivimos` is both
   * "we live" and "we lived". Worth stating rather than hiding.
   */
  it('names both tenses when a form is genuinely either', () => {
    expect(describeCode('verb|first-person,indicative,plural,present,preterite'))
      .toBe('present or preterite · 1st person plural');
  });
});

/**
 * The homograph guard. `casas` is a form of BOTH `casa` and `casar`, and the lemma the app
 * resolved is the only thing that says which the sentence meant.
 */
describe("a reading is only shown when the app's own lemmatizer agrees", () => {
  it('disambiguates by lemma', () => {
    expect(lookupGrammar(table, 'casas', 'casa')).toEqual(['feminine plural']);
    expect(lookupGrammar(table, 'casas', 'casar')).toEqual(['present · 2nd person singular']);
  });

  it('says nothing without a baseForm, however much the table knows', () => {
    expect(table.w['casas'], 'casas should be in the table').toBeTruthy();
    expect(lookupGrammar(table, 'casas', undefined)).toEqual([]);
  });

  it('says nothing when the lemmas disagree', () => {
    expect(lookupGrammar(table, 'casas', 'perro')).toEqual([]);
  });

  it('is case-insensitive, since a sentence-initial word is capitalised', () => {
    expect(lookupGrammar(table, 'Casas', 'Casa')).toEqual(['feminine plural']);
  });

  it('returns nothing for a word not in the table', () => {
    expect(lookupGrammar(table, 'zzzznotaword', 'zzzz')).toEqual([]);
  });
});

describe('real inflections a reader meets', () => {
  it.each([
    ['hablaba', 'hablar', 'imperfect · singular'],
    ['hablé', 'hablar', 'preterite · 1st person singular'],
    ['hablado', 'hablar', 'past participle'],
    ['hablando', 'hablar', 'gerund'],
    ['comimos', 'comer', 'preterite · 1st person plural'],
    ['vivirá', 'vivir', 'future · 3rd person singular'],
    ['buenas', 'bueno', 'feminine plural'],
    ['fui', 'ir', 'preterite · 1st person singular'],
  ])('%s (%s) → %s', (surface, lemma, expected) => {
    expect(lookupGrammar(table, surface, lemma)).toContain(expected);
  });
});

describe('the emitted table', () => {
  it('decodes every code it contains, or deliberately declines to', () => {
    for (const code of table.c) {
      const out = describeCode(code);
      expect(out === null || (typeof out === 'string' && out.length > 0), code).toBe(true);
    }
  });

  /**
   * The whitelist in build-esgrammar.mjs is what keeps this small. Left as a blacklist the code
   * space fragmented on country tags — 957 codes, most of them a real slot plus `Mexico`.
   */
  it('has a small code space, which is what the tag whitelist is for', () => {
    expect(table.c.length).toBeLessThan(250);
  });

  it('leaves almost nothing undescribed', () => {
    const silent = table.c.filter(c => describeCode(c) === null);
    expect(silent.length / table.c.length).toBeLessThan(0.1);
  });

  it('carries no code built from a regional or lexical tag', () => {
    for (const c of table.c) {
      expect(c, `${c} leaked a non-grammatical tag`)
        .not.toMatch(/Mexico|Spain|Chile|abbreviation|misspelling|clipping|initialism/);
    }
  });

  it('never contains a form identical to its own lemma', () => {
    for (const [form, entries] of Object.entries(table.w).slice(0, 5000)) {
      for (const [, lemma] of entries) expect(lemma.toLowerCase()).not.toBe(form);
    }
  });

  it('is big enough to be the real thing', () => {
    expect(Object.keys(table.w).length).toBeGreaterThan(80_000);
  });
});
