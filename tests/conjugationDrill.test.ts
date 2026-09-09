import { describe, it, expect } from 'vitest';
import esGrammar from '@data/es-grammar.json';
import {
  buildConjugationCards, gradeConjugation, promptSlot, exemplarFor, materialise,
  filterByTenses, promptLabel, siblingForms, deltaLabel, type ConjugationCard,
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
    id: 'x', kind: 'exception', cls: 'ir', exemplars: ['pedir'],
    slots: [
      { tense: 'pres', person: 'fs' },
      { tense: 'pres', person: 'ss' },
      { tense: 'pres', person: 'ts' },
    ],
  };

  it('walks every cell before repeating', () => {
    expect([0, 1, 2].map(r => promptSlot(card, r).person)).toEqual(['fs', 'ss', 'ts']);
    expect(promptSlot(card, 3).person).toBe('fs');
  });

  it('is deterministic — the same review asks the same thing', () => {
    expect(promptSlot(card, 7)).toEqual(promptSlot(card, 7));
    expect(promptSlot(card, 7)).toEqual(promptSlot(card, 10));
  });

  it('survives the edges', () => {
    expect(promptSlot(card, 0).person).toBe('fs');
    expect(() => promptSlot(card, -1)).not.toThrow();
  });

  it('names what it is asking in pronouns, not grammar jargon', () => {
    expect(promptLabel('pedir', { tense: 'pres', person: 'ts', form: 'pide' }))
      .toBe('pedir · present · él / ella');
    expect(promptLabel('pedir', { tense: 'gerund', person: '', form: 'pidiendo' }))
      .toBe('pedir · gerund');
  });

  it('describes a stem change in the three ways it can happen', () => {
    expect(deltaLabel({ from: '', to: 'i', at: 1 })).toContain('insert');
    expect(deltaLabel({ from: 'ce', to: '', at: 2 })).toContain('drop');
    expect(deltaLabel({ from: 'e', to: 'd', at: 3 })).toContain('→');
  });
});

/**
 * THE FIX FOR "it's always the same word over and over again".
 *
 * A pattern card used to pin the first regular verb in the deck, so all nine -ar cards showed
 * `ayudar` for ever. That is not only dull: a pattern demonstrated on ONE verb is
 * indistinguishable from a fact about that verb, which is the opposite of what a pattern card
 * is for.
 */
describe('a pattern is shown on different verbs', () => {
  const many = deck('hablar', 'cantar', 'ayudar', 'trabajar');

  it('rotates the exemplar as the card comes round again', () => {
    const cards = buildConjugationCards(table, many);
    const pres = cards.find(c => c.kind === 'pattern' && c.tense === 'pres')!;
    const shown = new Set([0, 1, 2, 3].map(r => exemplarFor(pres, r)));
    expect(shown.size).toBeGreaterThan(1);
  });

  it('does not show every pattern card the same verb on the same day', () => {
    const cards = buildConjugationCards(table, many).filter(c => c.kind === 'pattern');
    const first = new Set(cards.map(c => exemplarFor(c, 0)));
    expect(first.size).toBeGreaterThan(1);
  });

  it('is stable within one review, so the row and the question agree', () => {
    const cards = buildConjugationCards(table, many);
    const pres = cards.find(c => c.kind === 'pattern' && c.tense === 'pres')!;
    expect(exemplarFor(pres, 5)).toBe(exemplarFor(pres, 5));
  });

  /** An exception is a fact about ITS verb; showing it on another would be false. */
  it('never rotates an exception', () => {
    const cards = buildConjugationCards(table, deck('pedir', 'hablar', 'cantar'));
    const ex = cards.find(c => c.kind === 'exception')!;
    expect(ex.exemplars).toEqual(['pedir']);
    expect([0, 1, 2, 3].map(r => exemplarFor(ex, r))).toEqual(['pedir', 'pedir', 'pedir', 'pedir']);
  });

  it('resolves the forms against whichever verb is showing', () => {
    const cards = buildConjugationCards(table, many);
    const pres = cards.find(c => c.kind === 'pattern' && c.tense === 'pres')!;
    for (const r of [0, 1, 2, 3]) {
      const m = materialise(table, pres, r);
      expect(m.row).toHaveLength(6);
      expect(m.row.every(c => c.form.startsWith(m.lemma.slice(0, -2)))).toBe(true);
    }
  });
});

describe('the learner chooses the tenses', () => {
  const cards = () => buildConjugationCards(table, deck('hablar', 'pedir'));

  it('keeps only the chosen ones', () => {
    const only = filterByTenses(cards(), ['pres']);
    expect(only.every(c => c.slots.every(s => s.tense === 'pres'))).toBe(true);
    expect(only.length).toBeGreaterThan(0);
  });

  /** A filter that silences the whole drill is a broken screen, not a preference. */
  it('treats an empty choice as all, not as none', () => {
    expect(filterByTenses(cards(), []).length).toBe(cards().length);
    expect(filterByTenses(cards(), null).length).toBe(cards().length);
  });

  /** An exception spanning five tenses is still drillable by someone practising two. */
  it('narrows a multi-tense exception instead of dropping it', () => {
    const ex = cards().find(c => c.kind === 'exception')!;
    expect(new Set(ex.slots.map(s => s.tense)).size).toBeGreaterThan(1);
    const narrowed = filterByTenses([ex], ['pres'])[0];
    expect(narrowed.slots.every(s => s.tense === 'pres')).toBe(true);
    expect(narrowed.slots.length).toBeGreaterThan(0);
  });

  it('drops a card with nothing left to ask', () => {
    const patterns = cards().filter(c => c.tense === 'gerund');
    expect(filterByTenses(patterns, ['pres'])).toEqual([]);
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
    const lemmas = new Set(cards.filter(c => c.kind === 'exception').flatMap(c => c.exemplars));
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
    expect(pres?.exemplars).toEqual(['cantar']);
  });

  it('falls back to a canonical verb when the deck has only irregulars', () => {
    const cards = buildConjugationCards(table, deck('tener'));
    const pres = cards.find(c => c.kind === 'pattern' && c.tense === 'pres');
    expect(pres?.exemplars).toEqual(['comer']);
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
    const m = materialise(table, ex, 0);
    expect(m.row).toHaveLength(6);
    expect(new Set(m.row.map(c => c.tense)).size).toBe(1);
    // pedimos and pedís are regular and are shown anyway — that is what makes the row teach.
    const irregular = new Set(m.cells.map(c => c.form));
    expect(m.row.some(c => !irregular.has(c.form))).toBe(true);
    expect(m.cells.length).toBeGreaterThan(m.row.length);
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
