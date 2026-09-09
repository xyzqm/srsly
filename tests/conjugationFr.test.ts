import { describe, it, expect } from 'vitest';
import frGrammar from '@data/fr-grammar.json';
import {
  cellsForCodeFr, verbClassFr, regularFormFr, verbCellsFr, verbIndexFr,
  factsForVerbFr, patternCardsFr, passeCompose, auxiliaryFor, ETRE_VERBS,
} from '@/lib/conjugationFr';
import { cellKey, type GrammarTable } from '@/lib/conjugation';

/**
 * The French conjugation engine, run against the REAL Lexique-derived table.
 *
 * Every claim here is a claim about FRENCH — that `finir` takes -iss- and `partir` does not,
 * that `pincer` is not a form of `pouvoir` — so a fixture would test the parser against itself.
 * Same reasoning `tests/frenchLemmatizer.test.ts` gives for loading the real dictionary.
 */

const table = frGrammar as unknown as GrammarTable;
const cellsOf = (v: string) => verbCellsFr(table, v);

describe('reading Lexique’s positional codes', () => {
  /** 87 of the 140 verb codes carry more than one reading; twelve carry four or five. */
  it('emits every reading a code packs, not the first', () => {
    const cells = cellsForCodeFr('VER|ind:pre:1s;ind:pre:3s;sub:pre:1s;sub:pre:3s||');
    expect(cells).toEqual([
      { tense: 'pres', person: 'fs' }, { tense: 'pres', person: 'ts' },
      { tense: 'pressubj', person: 'fs' }, { tense: 'pressubj', person: 'ts' },
    ]);
  });

  /**
   * `imp` MEANS TWO THINGS BY POSITION — imperative MOOD in `imp:pre`, imparfait TENSE in
   * `ind:imp`. A substring test mislabels one, and a beginner cannot catch a confidently wrong
   * grammatical label.
   */
  it('tells the imperative mood from the imparfait tense', () => {
    expect(cellsForCodeFr('VER|ind:imp:3s||')).toEqual([{ tense: 'impf', person: 'ts' }]);
    expect(cellsForCodeFr('VER|imp:pre:2s||')).toEqual([]);      // imperative, deferred
  });

  /**
   * `inf` SHARES CODES WITH FINITE FORMS. Excluding any code CONTAINING `inf` would delete
   * real future and present cells — the same granularity mistake the Spanish clitic filter
   * made once already.
   */
  it('drops the infinitive slot without dropping its cellmates', () => {
    expect(cellsForCodeFr('VER|ind:fut:3s;inf||')).toEqual([{ tense: 'fut', person: 'ts' }]);
    expect(cellsForCodeFr('VER|inf||')).toEqual([]);
  });

  /** Agreement is not conjugation: only the base participle is a cell. */
  it('takes the participle only in its base form', () => {
    expect(cellsForCodeFr('VER|par:pas|m|s')).toEqual([{ tense: 'participle', person: '' }]);
    expect(cellsForCodeFr('VER|par:pas|m|')).toEqual([{ tense: 'participle', person: '' }]);
    expect(cellsForCodeFr('VER|par:pas|f|p')).toEqual([]);
    expect(cellsForCodeFr('VER|par:pas||p')).toEqual([]);
  });

  /** This app is for functional fluency, not for reading Victor Hugo. */
  it('excludes the literary tenses', () => {
    expect(cellsForCodeFr('VER|ind:pas:1s||')).toEqual([]);       // passé simple
    expect(cellsForCodeFr('VER|sub:imp:3s||')).toEqual([]);       // imparfait du subjonctif
  });

  it('reads the participe présent as the gerund slot', () => {
    expect(cellsForCodeFr('VER|par:pre||')).toEqual([{ tense: 'gerund', person: '' }]);
  });

  it('ignores anything that is not a verb', () => {
    expect(cellsForCodeFr('ADJ||f|s')).toEqual([]);
  });
});

describe('the -ir split, detected from the data', () => {
  /**
   * NOTHING IN THE SPELLING SEPARATES THEM. `finir` and `partir` both end in -ir; what differs
   * is the -iss- infix, and it is only visible in the plural.
   */
  it('separates the second group from the third by the -iss- infix', () => {
    expect(verbClassFr('finir', cellsOf('finir'))).toBe('ir2');
    expect(verbClassFr('partir', cellsOf('partir'))).toBe(null);
    expect(verbClassFr('dormir', cellsOf('dormir'))).toBe(null);
  });

  /** `ouvrir` takes -er endings, and falls out of ir2 correctly because `ouvrons` has no iss. */
  it('does not mistake ouvrir for a second-group verb', () => {
    expect(verbClassFr('ouvrir', cellsOf('ouvrir'))).toBe(null);
    expect(cellsOf('ouvrir').get(cellKey('pres', 'fs'))).toBe('ouvre');
  });

  it('classes the other two regular groups', () => {
    expect(verbClassFr('parler', cellsOf('parler'))).toBe('er');
    expect(verbClassFr('vendre', cellsOf('vendre'))).toBe('re');
  });

  /** aller ends in -er and is the one verb that must not be treated as first group. */
  it('refuses to call aller regular', () => {
    expect(verbClassFr('aller', cellsOf('aller'))).toBe(null);
  });

  it('gives no class to a verb it has no forms for', () => {
    expect(verbClassFr('zzzzir', new Map())).toBe(null);
  });
});

describe('the regular paradigms', () => {
  it('builds the three presents', () => {
    expect(regularFormFr('parler', 'er', 'pres', 'fp')).toBe('parlons');
    expect(regularFormFr('finir', 'ir2', 'pres', 'fp')).toBe('finissons');
    expect(regularFormFr('vendre', 're', 'pres', 'ts')).toBe('vend');
  });

  /**
   * THE FUTURE BUILDS ON THE INFINITIVE AND -re DROPS ITS FINAL e. `vendre` → `vendrai`, not
   * `vendreai`. Missing it would make every one of the 248 regular -re verbs look irregular.
   */
  it('drops the final e of an -re infinitive before the future endings', () => {
    expect(regularFormFr('vendre', 're', 'fut', 'fs')).toBe('vendrai');
    expect(regularFormFr('vendre', 're', 'cond', 'ts')).toBe('vendrait');
    expect(regularFormFr('parler', 'er', 'fut', 'fs')).toBe('parlerai');
    expect(regularFormFr('finir', 'ir2', 'fut', 'fs')).toBe('finirai');
  });

  it('is three classes times seven slots', () => {
    const cards = patternCardsFr();
    expect(cards).toHaveLength(21);
    expect(new Set(cards.map(c => c.key)).size).toBe(21);
  });
});

describe('facts, against the real table', () => {
  it('leaves a regular verb of each class with nothing to say', () => {
    expect(factsForVerbFr(table, 'parler')).toEqual([]);
    expect(factsForVerbFr(table, 'finir')).toEqual([]);
    expect(factsForVerbFr(table, 'vendre')).toEqual([]);
  });

  /** The g→ge spelling rule, which is one fact and not six. */
  it('collapses manger’s orthographic change to a single fact', () => {
    const facts = factsForVerbFr(table, 'manger');
    expect(facts).toHaveLength(1);
    expect(facts[0].kind).toBe('stem');
    const forms = facts[0].cells.map(c => c.actual);
    expect(forms).toContain('mangeons');
    expect(forms).toContain('mangeait');
  });

  /**
   * A THIRD-GROUP VERB IS LEARNED AS ROWS. There is no paradigm to deviate from, so a stem
   * delta would be arithmetic dressed as a rule.
   */
  it('gives a third-group verb one whole row per tense', () => {
    const facts = factsForVerbFr(table, 'partir');
    expect(facts.every(f => f.kind === 'paradigm')).toBe(true);
    const pres = facts.find(f => f.tense === 'pres')!;
    expect(pres.cells.map(c => c.actual))
      .toEqual(['pars', 'pars', 'part', 'partons', 'partez', 'partent']);
  });

  it('keeps a suppletive row intact', () => {
    const pres = factsForVerbFr(table, 'aller').find(f => f.tense === 'pres')!;
    expect(pres.cells.map(c => c.actual)).toEqual(['vais', 'vas', 'va', 'allons', 'allez', 'vont']);
  });

  /**
   * THE BAD ROW THAT A LENGTH RULE LET THROUGH.
   *
   * Lexique tags `pincer` — the infinitive of "to pinch" — as `VER|ind:pre:2p` with the lemma
   * `pouvoir`. Both it and `pouvez` claim that cell, `pouvoir` has no class to cost them
   * against, and both are six letters — so the tie broke alphabetically and the drill was ready
   * to teach `vous pincer`. A conjugated form keeps the shape of its verb: `pouvez` shares four
   * letters with `pouvoir` and `pincer` shares one.
   */
  it('prefers the form that still looks like its verb', () => {
    expect(cellsOf('pouvoir').get(cellKey('pres', 'sp'))).toBe('pouvez');
  });

  /** And suppletion is safe from that rule, because nothing else claims those cells. */
  it('does not let the prefix rule break a suppletive form', () => {
    expect(cellsOf('aller').get(cellKey('pres', 'fs'))).toBe('vais');
    expect(cellsOf('être').get(cellKey('pres', 'fs'))).toBe('suis');
  });

  it('is deterministic', () => {
    expect(factsForVerbFr(table, 'prendre').map(f => f.key))
      .toEqual(factsForVerbFr(table, 'prendre').map(f => f.key));
  });
});

/**
 * The shape of French, measured — a regression guard on the whole pipeline. If a rebuild of
 * fr-grammar.json changes the tagging these move, and a test is where that should surface.
 */
describe('the vocabulary, in aggregate', () => {
  it('leaves most verbs regular and compresses the rest', () => {
    let verbs = 0, regular = 0, facts = 0, cells = 0;
    for (const [lemma, cs] of verbIndexFr(table)) {
      if (cs.size < 15) continue;
      verbs++;
      const f = factsForVerbFr(table, lemma);
      if (f.length === 0) regular++;
      facts += f.length;
      cells += f.reduce((a, x) => a + x.cells.length, 0);
    }
    expect(verbs).toBeGreaterThan(1000);
    expect(regular / verbs).toBeGreaterThan(0.6);
    expect(cells / facts).toBeGreaterThan(3);
  });
});

/**
 * A CLASS A VERB DOES NOT DESERVE IS WORSE THAN NO CLASS AT ALL.
 *
 * `être` ends in -re, so the ending alone called it regular — and `candidateCost` then prefers
 * whichever candidate looks most regular. Lexique tags `étaient` as both the imperfect and the
 * present third plural, and against a nominal -re paradigm it scores far better than `sont`,
 * so être's present row came out with the imperfect smuggled into it.
 */
describe('a verb has to earn the class its ending claims', () => {
  const classOf = (v: string) => verbClassFr(v, verbCellsFr(table, v));

  it('demotes the verbs that only look regular', () => {
    expect(classOf('être')).toBe(null);
    expect(classOf('faire')).toBe(null);
    expect(classOf('dire')).toBe(null);
    expect(classOf('prendre')).toBe(null);
  });

  /** And does not over-demote: these deviate a little and are still their class. */
  it('keeps a verb that merely has a wrinkle', () => {
    expect(classOf('manger')).toBe('er');      // 21% — the g→ge spelling rule
    expect(classOf('mettre')).toBe('re');      // 13%
    expect(classOf('vendre')).toBe('re');      // 0%
    expect(classOf('parler')).toBe('er');
    expect(classOf('finir')).toBe('ir2');
  });

  /** The row that went wrong, pinned. */
  it('gives être its real present tense', () => {
    const row = ['fs', 'ss', 'ts', 'fp', 'sp', 'tp']
      .map(p => verbCellsFr(table, 'être').get(cellKey('pres', p as never)));
    expect(row).toEqual(['suis', 'es', 'est', 'sommes', 'êtes', 'sont']);
  });

  it('gives avoir and aller theirs too', () => {
    const row = (v: string) => ['fs', 'ss', 'ts', 'fp', 'sp', 'tp']
      .map(p => verbCellsFr(table, v).get(cellKey('pres', p as never)));
    expect(row('avoir')).toEqual(['ai', 'as', 'a', 'avons', 'avez', 'ont']);
    expect(row('aller')).toEqual(['vais', 'vas', 'va', 'allons', 'allez', 'vont']);
  });
});

describe('the passé composé, composed rather than looked up', () => {
  /** The authored list is held to the same standard as core-overrides' beginner sets. */
  it('names only verbs the table actually knows', () => {
    const missing = [...ETRE_VERBS].filter(v => verbCellsFr(table, v).size === 0);
    expect(missing).toEqual([]);
  });

  it('picks the auxiliary', () => {
    expect(auxiliaryFor('aller')).toBe('être');
    expect(auxiliaryFor('partir')).toBe('être');
    expect(auxiliaryFor('parler')).toBe('avoir');
    expect(auxiliaryFor('finir')).toBe('avoir');
  });

  /**
   * NUMBER AGREEMENT IS NOT OPTIONAL. `nous sommes allé` is simply wrong French, and printing
   * it on a row the learner is asked to read would teach an error.
   */
  it('agrees an être participle in number', () => {
    const pc = passeCompose(table, 'aller')!;
    expect([...pc.forms.values()])
      .toEqual(['suis allé', 'es allé', 'est allé', 'sommes allés', 'êtes allés', 'sont allés']);
  });

  it('leaves an avoir participle alone, because it does not agree with the subject', () => {
    const pc = passeCompose(table, 'parler')!;
    expect([...pc.forms.values()])
      .toEqual(['ai parlé', 'as parlé', 'a parlé', 'avons parlé', 'avez parlé', 'ont parlé']);
  });

  it('does not double an s that is already there', () => {
    for (const v of ETRE_VERBS) {
      const pc = passeCompose(table, v);
      for (const form of pc?.forms.values() ?? []) expect(form).not.toMatch(/ss$/);
    }
  });

  it('returns nothing for a verb with no participle', () => {
    expect(passeCompose(table, 'zzzzer')).toBeNull();
  });
});
