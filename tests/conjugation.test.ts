import { describe, it, expect } from 'vitest';
import esGrammar from '@data/es-grammar.json';
import cefrLevels from '@data/cefr-levels.json';
import {
  verbClass, regularForm, regularParts, stemDelta, diffCell,
  factsForVerb, verbCells, cellsForCode, patternCards,
  cellKey, PERSON_ORDER,
} from '@/lib/conjugation';

/**
 * The Spanish conjugation engine, run against the REAL grammar table.
 *
 * Deliberately not a fixture. Every claim here is a claim about SPANISH — that `pensar`'s
 * eight irregular cells are one fact, that `háblame` is not a conjugation, that most verbs are
 * regular — so a stub would test the differ against itself. This is the same reasoning
 * `tests/frenchLemmatizer.test.ts` gives for loading the real dictionary.
 */

const table = esGrammar as unknown as { c: string[]; w: Record<string, [number, string][]> };
const levels = cefrLevels as unknown as Record<string, string[]>;

describe('the regular paradigm', () => {
  it('knows the three classes', () => {
    expect(verbClass('hablar')).toBe('ar');
    expect(verbClass('comer')).toBe('er');
    expect(verbClass('vivir')).toBe('ir');
    expect(verbClass('casa')).toBeNull();
  });

  it('builds the present indicative', () => {
    expect(PERSON_ORDER.map(p => regularForm('hablar', 'pres', p)))
      .toEqual(['hablo', 'hablas', 'habla', 'hablamos', 'habláis', 'hablan']);
    expect(PERSON_ORDER.map(p => regularForm('vivir', 'pres', p)))
      .toEqual(['vivo', 'vives', 'vive', 'vivimos', 'vivís', 'viven']);
  });

  /** Future and conditional attach to the WHOLE INFINITIVE, which is why tendré is a stem change. */
  it('builds the future on the infinitive, not the stem', () => {
    expect(regularForm('hablar', 'fut', 'fs')).toBe('hablaré');
    expect(regularParts('hablar', 'fut', 'fs')).toEqual({ stem: 'hablar', ending: 'é' });
    expect(regularParts('hablar', 'pres', 'fs')).toEqual({ stem: 'habl', ending: 'o' });
  });

  it('has no person for the two non-finite slots', () => {
    expect(regularForm('hablar', 'gerund', '')).toBe('hablando');
    expect(regularForm('comer', 'participle', '')).toBe('comido');
  });
});

describe('the diff isolates a real change, not a truncated string', () => {
  /**
   * THE TRAP THIS ENGINE EXISTS TO AVOID. Comparing `pensa` with `piensa` as whole strings
   * finds the shared suffix `ensa` and reports the stem as `pi` — which clusters correctly and
   * so survives a counting exercise, then prints a card that says "pi".
   */
  it('cuts at the KNOWN ending before comparing stems', () => {
    const d = diffCell('pensar', 'pres', 'ts', 'piensa');
    expect(d?.expected).toBe('pensa');
    expect(d?.delta).toEqual({ from: '', to: 'i', at: 1 });   // pens -> piens, not "pi"
  });

  it('reads an insertion, a replacement and a deletion with one operation', () => {
    expect(stemDelta('pens', 'piens')).toEqual({ from: '', to: 'i', at: 1 });
    expect(stemDelta('tener', 'tendr')).toEqual({ from: 'e', to: 'd', at: 3 });
    expect(stemDelta('hacer', 'har')).toEqual({ from: 'ce', to: '', at: 2 });
    expect(stemDelta('habl', 'habl')).toBeNull();
  });

  /** A form that does not carry the regular ending is a different sub-paradigm, not a stem tweak. */
  it('reports no delta when the ending itself changed', () => {
    const d = diffCell('hacer', 'pret', 'fs', 'hice');
    expect(d).not.toBeNull();
    expect(d?.delta).toBeNull();
  });

  it('returns nothing for a cell that is simply regular', () => {
    expect(diffCell('hablar', 'pres', 'fs', 'hablo')).toBeNull();
  });
});

describe('reading cells out of the table', () => {
  /**
   * THE CLITIC FILTER. A clitic form carries the SAME code as the bare one, so the tags cannot
   * separate them — but a clitic only ever makes a form longer.
   */
  it('takes the bare form over the one carrying a pronoun', () => {
    const cells = verbCells(table, 'hablar');
    expect(cells.get(cellKey('gerund', ''))).toBe('hablando');       // not hablándole
    expect(cells.get(cellKey('pres', 'ts'))).toBe('habla');          // not háblame
  });

  /**
   * AND IT KEEPS THE REAL CELLS THE OBVIOUS FILTER WOULD HAVE DELETED. "Drop anything starting
   * with the infinitive and longer" removes all four of these, every one a genuine conjugation.
   */
  it('keeps forms that merely look like the infinitive plus something', () => {
    const cells = verbCells(table, 'hablar');
    expect(cells.get(cellKey('fut', 'fp'))).toBe('hablaremos');
    expect(cells.get(cellKey('impsubj', 'ts'))).toBe('hablara');
    expect(cells.get(cellKey('fut', 'fs'))).toBe('hablaré');
    expect(cells.get(cellKey('impsubj', 'tp'))).toBe('hablaran');
  });

  /**
   * A BAD ROW IS NOT ALWAYS A LONGER ROW, which is why the choice is not "shortest wins".
   *
   * Wiktionary lists BOTH `tiene` and `tiée` as the third-person present of `tener`, tagged
   * identically. `tiée` is not a word and it is one character shorter, so a length rule prints
   * it on a card for a top-twenty verb. Costing each candidate against the regular paradigm
   * picks `tiene` — a one-letter insertion — over `tiée`, which rewrites two.
   */
  it('prefers the form that makes the smaller claim, not the shorter string', () => {
    expect(verbCells(table, 'tener').get(cellKey('pres', 'ts'))).toBe('tiene');
    // And the consequence: the third person joins the real e→ie boot rather than inventing
    // a fact of its own.
    const facts = factsForVerb(table, 'tener');
    const boot = facts.find(f => f.cells.some(c => c.actual === 'tienes'));
    expect(boot?.cells.map(c => c.actual).sort()).toEqual(['tiene', 'tienen', 'tienes']);
  });

  it('excludes the archaic, the regional and the clitic-contaminated slots', () => {
    expect(cellsForCode('verb|future,singular,subjunctive,third-person')).toEqual([]);
    expect(cellsForCode('verb|indicative,present,second-person,singular,with-voseo')).toEqual([]);
    expect(cellsForCode('verb|first-person,gerund,plural')).toEqual([]);
    expect(cellsForCode('verb|feminine,participle,past,singular')).toEqual([]);
    expect(cellsForCode('verb|infinitive')).toEqual([]);
  });

  /** hablamos really is both, for -ar and -ir verbs. One form, two cells. */
  it('fills both cells when a form is genuinely ambiguous', () => {
    const cells = cellsForCode('verb|first-person,indicative,plural,present,preterite');
    expect(cells).toEqual([{ tense: 'pres', person: 'fp' }, { tense: 'pret', person: 'fp' }]);
  });
});

describe('clustering: one fact per thing to learn', () => {
  /** The headline claim of the whole design. */
  it('collapses pensar to a single e→ie fact spanning two tenses', () => {
    const facts = factsForVerb(table, 'pensar');
    expect(facts).toHaveLength(1);
    expect(facts[0].kind).toBe('stem');
    expect(facts[0].delta).toEqual({ from: '', to: 'i', at: 1 });
    expect(facts[0].cells.length).toBeGreaterThanOrEqual(8);
    expect(new Set(facts[0].cells.map(c => c.tense))).toEqual(new Set(['pres', 'pressubj']));
  });

  it('leaves a fully regular verb with nothing to say', () => {
    expect(factsForVerb(table, 'hablar')).toEqual([]);
    expect(factsForVerb(table, 'vivir')).toEqual([]);
    expect(factsForVerb(table, 'comer')).toEqual([]);
  });

  it('keeps two different changes in one verb apart', () => {
    const keys = factsForVerb(table, 'tener').map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);      // no key collisions
    expect(keys.length).toBeGreaterThan(1);            // tengo and tienes are not one fact
  });

  /** Card ids must be stable, or a rebuild silently resets every schedule. */
  it('is deterministic in order and in key', () => {
    const a = factsForVerb(table, 'tener').map(f => f.key);
    const b = factsForVerb(table, 'tener').map(f => f.key);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(a);
  });

  /**
   * A STRONG PRETERITE DECOMPOSES, and that is better than grouping the row.
   *
   * `hacer` is hice/hiciste/hizo/hicimos/hicisteis/hicieron. Four of those carry the ordinary
   * -er preterite endings on an altered stem, so they cluster with the imperfect subjunctive
   * as ONE fact (hac→hic, ten cells). Only `hice` and `hizo` have endings the paradigm cannot
   * produce, and they are their own fact. Asserting "the whole row is one card" was my
   * expectation and the engine's answer is the better one — the stem change really is shared
   * with hiciera, and hiding that inside a preterite card would teach it twice.
   */
  it('splits a strong preterite into its shared stem and its odd endings', () => {
    const facts = factsForVerb(table, 'hacer');
    const para = facts.find(x => x.kind === 'paradigm' && x.tense === 'pret');
    expect(para?.cells.map(c => c.actual)).toEqual(['hice', 'hizo']);
    const stem = facts.find(x => x.kind === 'stem' && x.cells.some(c => c.actual === 'hiciste'));
    expect(stem).toBeDefined();
    expect(new Set(stem!.cells.map(c => c.tense))).toEqual(new Set(['pret', 'impsubj']));
  });

  it('never emits a fact with no cells', () => {
    for (const v of ['ser', 'ir', 'haber', 'poder', 'pedir', 'dormir']) {
      for (const f of factsForVerb(table, v)) expect(f.cells.length).toBeGreaterThan(0);
    }
  });

  it('accounts for every irregular cell exactly once', () => {
    for (const v of ['tener', 'hacer', 'poder', 'ser', 'dormir']) {
      const facts = factsForVerb(table, v);
      const cells = facts.flatMap(f => f.cells.map(c => cellKey(c.tense, c.person)));
      expect(new Set(cells).size).toBe(cells.length);
    }
  });
});

describe('the pattern cards are the framework', () => {
  it('is three classes times nine slots', () => {
    const cards = patternCards();
    expect(cards).toHaveLength(27);
    expect(new Set(cards.map(c => c.key)).size).toBe(27);
  });

  it('carries six endings for a finite tense and one for the rest', () => {
    const cards = patternCards();
    for (const c of cards) {
      expect(c.endings.length).toBe(c.tense === 'gerund' || c.tense === 'participle' ? 1 : 6);
    }
  });
});

/**
 * THE SHAPE OF SPANISH, measured rather than asserted — a regression guard on the whole
 * pipeline. If a future rebuild of es-grammar.json changes the tagging, these move and the
 * curriculum silently changes size; a test is where that should surface.
 */
describe('the graded vocabulary, in aggregate', () => {
  const graded = new Set(Object.values(levels).flat());
  const verbs = [...graded].filter(v => verbClass(v)).sort();

  it('finds the verbs', () => {
    expect(verbs.length).toBeGreaterThan(1000);
  });

  it('leaves most verbs entirely regular, and compresses the rest', () => {
    let regular = 0, facts = 0, cells = 0, judged = 0;
    for (const v of verbs) {
      const cellCount = verbCells(table, v).size;
      if (cellCount < 20) continue;                    // too sparse to judge
      judged++;
      const f = factsForVerb(table, v);
      if (f.length === 0) regular++;
      facts += f.length;
      cells += f.reduce((a, x) => a + x.cells.length, 0);
    }
    expect(judged).toBeGreaterThan(1000);
    // Most verbs ask nothing beyond the pattern.
    expect(regular / judged).toBeGreaterThan(0.5);
    // And the ones that do are worth several cells each — the whole reason to cluster.
    expect(cells / facts).toBeGreaterThan(3);
  });
});
