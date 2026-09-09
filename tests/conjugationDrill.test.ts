import { describe, it, expect } from 'vitest';
import esGrammar from '@data/es-grammar.json';
import {
  buildConjugationCards, gradeConjugation, promptCell, promptLabel, siblingForms,
  deltaLabel, type ConjugationCard,
} from '@/lib/conjugationDrill';
import { drillKey, parseDrillKey } from '@/lib/drillState';
import type { GrammarTable } from '@/lib/conjugation';

const table = esGrammar as unknown as GrammarTable;
const deck = (...h: string[]) => h.map(x => ({ h: x }));

describe('an accent is not a typo in a conjugation drill', () => {
  const hablar = siblingForms(table, 'hablar');

  /**
   * THE MOST IMPORTANT RULE IN THE DRILL. `lib/typedAnswer.ts` forgives a missing accent as a
   * near miss and is right to for vocabulary. Here the accent separates two answers to two
   * different questions, on 76% of the graded verbs.
   */
  it('rejects a form that is really another cell of the same verb', () => {
    expect(gradeConjugation('hablo', 'habló', hablar).verdict).toBe('wrong');
    expect(gradeConjugation('hable', 'hablé', hablar).verdict).toBe('wrong');
    expect(gradeConjugation('hablara', 'hablará', hablar).verdict).toBe('wrong');
  });

  /** The control: without the sibling list this is exactly what the old grader did. */
  it('is the tier the vocabulary grader would have given', () => {
    expect(gradeConjugation('hablo', 'habló', []).verdict).toBe('close');
  });

  /** A genuine diacritic slip, where nothing else in the paradigm collides, still forgives. */
  it('keeps the near miss where it cannot be a confusion', () => {
    const habl = siblingForms(table, 'hablar');
    // hablábamos has no accent-stripped twin anywhere in hablar's paradigm.
    expect(gradeConjugation('hablabamos', 'hablábamos', habl).verdict).toBe('close');
  });

  it('still accepts the right answer, accents and all', () => {
    expect(gradeConjugation('habló', 'habló', hablar).verdict).toBe('exact');
    expect(gradeConjugation('  HABLÓ ', 'habló', hablar).verdict).toBe('exact');
  });

  it('still calls a different verb wrong', () => {
    expect(gradeConjugation('comí', 'habló', hablar).verdict).toBe('wrong');
    expect(gradeConjugation('', 'habló', hablar).verdict).toBe('wrong');
  });
});

describe('one cell per prompt, rotating', () => {
  const card: ConjugationCard = {
    id: 'x', kind: 'exception', lemma: 'pedir', cls: 'ir',
    cells: [
      { tense: 'pres', person: 'fs', form: 'pido' },
      { tense: 'pres', person: 'ss', form: 'pides' },
      { tense: 'pres', person: 'ts', form: 'pide' },
    ],
    row: [],
  };

  it('walks every cell before repeating', () => {
    const seen = [0, 1, 2].map(r => promptCell(card, r).form);
    expect(seen).toEqual(['pido', 'pides', 'pide']);
    expect(promptCell(card, 3).form).toBe('pido');
  });

  it('is deterministic — the same review asks the same thing', () => {
    expect(promptCell(card, 7).form).toBe(promptCell(card, 7).form);
    expect(promptCell(card, 7).form).toBe(promptCell(card, 10).form);
  });

  /** A card with no reviews yet, and a defensive negative, must not throw. */
  it('survives the edges', () => {
    expect(promptCell(card, 0).form).toBe('pido');
    expect(() => promptCell(card, -1)).not.toThrow();
  });

  it('names what it is asking in pronouns, not grammar jargon', () => {
    expect(promptLabel('pedir', card.cells[2])).toBe('pedir · present · él / ella');
    expect(promptLabel('pedir', { tense: 'gerund', person: '', form: 'pidiendo' }))
      .toBe('pedir · gerund');
  });

  it('describes a stem change in the three ways it can happen', () => {
    expect(deltaLabel({ from: '', to: 'i', at: 1 })).toContain('insert');
    expect(deltaLabel({ from: 'ce', to: '', at: 2 })).toContain('drop');
    expect(deltaLabel({ from: 'e', to: 'd', at: 3 })).toContain('→');
  });
});

describe('the deck decides which cards exist', () => {
  it('teaches only the classes the learner actually has', () => {
    const cards = buildConjugationCards(table, deck('hablar'));
    const classes = new Set(cards.filter(c => c.kind === 'pattern').map(c => c.cls));
    expect(classes).toEqual(new Set(['ar']));
  });

  it('emits nine pattern cards per class present', () => {
    const cards = buildConjugationCards(table, deck('hablar', 'comer'));
    const pattern = cards.filter(c => c.kind === 'pattern');
    expect(pattern).toHaveLength(18);
    expect(new Set(pattern.map(c => c.cls))).toEqual(new Set(['ar', 'er']));
  });

  it('puts the patterns before the exceptions', () => {
    const cards = buildConjugationCards(table, deck('pedir'));
    const firstException = cards.findIndex(c => c.kind === 'exception');
    const lastPattern = cards.map(c => c.kind).lastIndexOf('pattern');
    expect(lastPattern).toBeLessThan(firstException);
  });

  it('draws exceptions only from verbs in the deck', () => {
    const cards = buildConjugationCards(table, deck('pedir', 'hablar'));
    const lemmas = new Set(cards.filter(c => c.kind === 'exception').map(c => c.lemma));
    expect(lemmas).toEqual(new Set(['pedir']));      // hablar is regular, tener is not owned
  });

  it('gives a regular verb no exception cards at all', () => {
    const cards = buildConjugationCards(table, deck('hablar'));
    expect(cards.every(c => c.kind === 'pattern')).toBe(true);
  });

  it('ignores deck words that are not verbs', () => {
    expect(buildConjugationCards(table, deck('casa', 'perro'))).toEqual([]);
  });

  /** A pattern is best shown on a verb the learner already owns. */
  it('conjugates a pattern on the learner’s own regular verb when there is one', () => {
    const cards = buildConjugationCards(table, deck('cantar'));
    const pres = cards.find(c => c.kind === 'pattern' && c.tense === 'pres');
    expect(pres?.lemma).toBe('cantar');
  });

  it('falls back to a canonical verb when the deck has only irregulars', () => {
    const cards = buildConjugationCards(table, deck('tener'));
    const pres = cards.find(c => c.kind === 'pattern' && c.tense === 'pres');
    expect(pres?.lemma).toBe('comer');
  });

  /**
   * `row` and `cells` are different things and the row is often SMALLER, which is the point.
   * `cells` is everything the fact covers — pedir's e→i spans nineteen cells across five
   * tenses. `row` is one complete tense to read, including the forms that behave normally, so
   * the change is met as a deviation from something rather than as a list.
   */
  it('anchors an exception in one complete row, regular forms included', () => {
    const cards = buildConjugationCards(table, deck('pedir'));
    const ex = cards.find(c => c.kind === 'exception')!;
    expect(ex.row).toHaveLength(6);
    expect(new Set(ex.row.map(c => c.tense)).size).toBe(1);
    // pedimos and pedís are regular and are shown anyway — that is what makes the row teach.
    const irregular = new Set(ex.cells.map(c => c.form));
    expect(ex.row.some(c => !irregular.has(c.form))).toBe(true);
    expect(ex.cells.length).toBeGreaterThan(ex.row.length);
  });
});

describe('card ids survive the storage layer', () => {
  it('round-trips through the c: namespace, colons and all', () => {
    const cards = buildConjugationCards(table, deck('pedir'));
    for (const c of cards) {
      const stored = drillKey('c', c.id);
      expect(parseDrillKey(stored)).toEqual({ kind: 'c', id: c.id });
    }
  });

  it('is stable and unique across rebuilds', () => {
    const a = buildConjugationCards(table, deck('pedir', 'tener', 'hablar')).map(c => c.id);
    const b = buildConjugationCards(table, deck('pedir', 'tener', 'hablar')).map(c => c.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it('does not collide between two verbs sharing a fact', () => {
    const cards = buildConjugationCards(table, deck('pedir', 'servir'));
    const ids = cards.filter(c => c.kind === 'exception').map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
