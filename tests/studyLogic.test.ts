import { describe, it, expect } from 'vitest';
import { isActive, isDueToday, isReadyNow, todayStr, dateInDays } from '@/lib/deck';
import { selectClozeTargets, MIN_BLANKS } from '@/lib/clozeTargets';
import type { DeckWord, Sentence, PassageToken } from '@/lib/types';

const card = (over: Partial<DeckWord> = {}): DeckWord =>
  ({ id: 'c', h: '词', p: '', m: 'word', ...over });

/**
 * The gates that decide whether a card is shown at all. Every one of these has a way of
 * being quietly wrong that only surfaces as "why is this card here" weeks later.
 */
describe('isActive excludes everything out of circulation', () => {
  it.each([
    ['pool',    card({ pool: true })],
    ['paused',  card({ paused: true })],
    ['snoozed', card({ snoozeUntil: dateInDays(3) })],
  ])('%s is not active', (_l, w) => expect(isActive(w)).toBe(false));

  it('a snooze that has expired is active again', () => {
    expect(isActive(card({ snoozeUntil: dateInDays(-1) }))).toBe(true);
  });

  it('an ordinary card is active', () => expect(isActive(card())).toBe(true));
});

describe('isDueToday', () => {
  it('a card with no dueAt is due (never studied)', () => {
    expect(isDueToday(card())).toBe(true);
  });
  it('due today and overdue both count', () => {
    expect(isDueToday(card({ dueAt: todayStr() }))).toBe(true);
    expect(isDueToday(card({ dueAt: dateInDays(-9) }))).toBe(true);
  });
  it('tomorrow does not', () => {
    expect(isDueToday(card({ dueAt: dateInDays(1) }))).toBe(false);
  });
  it('an inactive card is never due, whatever its date', () => {
    expect(isDueToday(card({ dueAt: dateInDays(-9), pool: true }))).toBe(false);
    expect(isDueToday(card({ dueAt: dateInDays(-9), paused: true }))).toBe(false);
  });
});

describe('isReadyNow respects the intra-day learning step', () => {
  it('holds a learning card until its minutes have elapsed', () => {
    const soon = card({ phase: 'learning', dueAt: todayStr(), dueAtMs: Date.now() + 60_000 });
    expect(isDueToday(soon)).toBe(true);      // due today…
    expect(isReadyNow(soon)).toBe(false);     // …but not yet
  });
  it('releases it once the step has passed', () => {
    const ready = card({ phase: 'learning', dueAt: todayStr(), dueAtMs: Date.now() - 1000 });
    expect(isReadyNow(ready)).toBe(true);
  });
});

// ── Blank selection ───────────────────────────────────────────────────────────
const tok = (text: string, vocab = false): PassageToken =>
  vocab ? { text, reading: '', meaning: 'm', type: 'vocab' } : { text };
const sentence = (...toks: PassageToken[]): Sentence =>
  ({ tokens: toks, plainText: toks.map(t => t.text).join(' ') });

describe('selectClozeTargets', () => {
  const due = new Set(['casa', 'perro']);
  const deck = [card({ h: 'casa', reviews: 3, stability: 4 }), card({ h: 'perro', reviews: 3, stability: 4 })];
  const text = [
    sentence(tok('La'), tok('casa', true), tok('es'), tok('grande')),
    sentence(tok('El'), tok('perro', true), tok('corre'), tok('rápido')),
  ];

  it('only ever blanks words that are due', () => {
    const { words } = selectClozeTargets(text, deck, due, 15, 20);
    for (const w of words) expect(due.has(w)).toBe(true);
  });

  it('blanks nothing when nothing is due', () => {
    expect(selectClozeTargets(text, deck, new Set(), 15, 20).words.size).toBe(0);
  });

  /**
   * Density is a SHARE, so the count scales with the passage and is not clamped. A ceiling was
   * tried here and removed: a share that stops scaling past a threshold is not a share, and it
   * silently overrode anyone who set the density high.
   */
  const longPassage = (n: number) => {
    const sents: Sentence[] = [];
    const words: DeckWord[] = [];
    const dueMany = new Set<string>();
    for (let i = 0; i < n; i++) {
      const w = `w${i}`;
      dueMany.add(w);
      words.push(card({ h: w, reviews: 3, stability: 4 }));
      sents.push(sentence(tok('el'), tok(w, true), tok('muy'), tok('bien')));
    }
    return { sents, words, dueMany };
  };

  it('never clamps the blank count — the share keeps scaling', () => {
    const { sents, words, dueMany } = longPassage(60);
    const { blanks, budget, tokens } = selectClozeTargets(sents, words, dueMany, 15, 100);
    expect(budget).toBe(Math.round(tokens * 0.15));
    expect(blanks).toBeGreaterThan(20);          // the old ceiling was 12
  });

  it('a longer passage yields proportionally more blanks at the same density', () => {
    const small = longPassage(20);
    const big = longPassage(80);
    const a = selectClozeTargets(small.sents, small.words, small.dueMany, 15, 500).blanks;
    const b = selectClozeTargets(big.sents, big.words, big.dueMany, 15, 500).blanks;
    expect(b).toBeGreaterThan(a * 2);
  });

  it('density is the only control over how many blanks there are', () => {
    const { sents, words, dueMany } = longPassage(60);
    const at5 = selectClozeTargets(sents, words, dueMany, 5, 500).budget;
    const at15 = selectClozeTargets(sents, words, dueMany, 15, 500).budget;
    const at40 = selectClozeTargets(sents, words, dueMany, 40, 500).budget;
    expect(at15).toBe(at5 * 3);
    expect(at40 / at15).toBeCloseTo(40 / 15, 1);
  });

  // The cap and the all-or-nothing rule can deadlock: 25 occurrences never fit a small budget.
  it('still blanks the most-owed word when it alone exceeds the budget', () => {
    const repeated: Sentence[] = [];
    for (let i = 0; i < 25; i++) {
      repeated.push(sentence(tok('el'), tok('camarón'), tok('playa', true)));
    }
    const one = new Set(['playa']);
    const { words, blanks } = selectClozeTargets(
      repeated, [card({ h: 'playa', reviews: 3, stability: 4 })], one, 1, 20);
    expect(words.has('playa')).toBe(true);
    expect(blanks).toBe(25);
  });

  it('a very short passage still gets MIN_BLANKS worth of budget', () => {
    const { budget } = selectClozeTargets(text, deck, due, 1, 20);
    expect(budget).toBe(MIN_BLANKS);
  });

  it('does not invent blanks for words absent from the text', () => {
    const { words } = selectClozeTargets(text, deck, new Set(['gato']), 15, 20);
    expect(words.has('gato')).toBe(false);
  });

  it('a zero new-card budget cannot introduce a brand-new word', () => {
    const fresh = [card({ h: 'casa' })];                    // no reviews, no stability = new
    const { words } = selectClozeTargets(text, fresh, new Set(['casa']), 15, 0);
    expect(words.has('casa')).toBe(false);
  });
});
