import { describe, it, expect } from 'vitest';
import { isActive, isDueToday, isReadyNow, todayStr, dateInDays } from '@/lib/deck';
import { selectClozeTargets } from '@/lib/clozeTargets';
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
