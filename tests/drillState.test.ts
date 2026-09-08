import { describe, it, expect } from 'vitest';
import {
  drillKey, parseDrillKey, drillView, drillWrite,
  mergeDrillCards, mergeDrillState, type DrillCards,
} from '@/lib/drillState';

/**
 * The shared drill column.
 *
 * The merge suite moved here wholesale from `tests/writingState.test.ts` when the storage half
 * was split out — the rule was never specific to characters, which is the whole argument for
 * one column serving handwriting and conjugation both.
 *
 * The namespacing tests are new, and two of them are the ones that matter: an unprefixed key
 * must read as handwriting (that is the entire migration off `writing_state`), and writing one
 * drill must not delete another's cards (that is the one way a shared column could be worse
 * than two).
 */

describe('keys carry which drill they belong to', () => {
  it('round-trips a key', () => {
    expect(parseDrillKey(drillKey('w', '好'))).toEqual({ kind: 'w', id: '好' });
    expect(parseDrillKey(drillKey('c', 'hablar:pres'))).toEqual({ kind: 'c', id: 'hablar:pres' });
  });

  /** Conjugation ids contain separators of their own, so only the FIRST one is the prefix. */
  it('splits on the first separator only', () => {
    expect(parseDrillKey('c:hablar:pres:1s')).toEqual({ kind: 'c', id: 'hablar:pres:1s' });
  });

  /**
   * THE MIGRATION, AS A TEST. Every key written before the rename was a bare Han character in
   * `writing_state`, so an unprefixed key is handwriting. Get this wrong and every learner's
   * existing practice history silently becomes unreachable.
   */
  it('reads an unprefixed key as handwriting', () => {
    expect(parseDrillKey('好')).toEqual({ kind: 'w', id: '好' });
    expect(parseDrillKey('朋')).toEqual({ kind: 'w', id: '朋' });
  });

  /** A character that happens to look like a prefix is still a character. */
  it('is not fooled by a one-character id', () => {
    expect(parseDrillKey('w')).toEqual({ kind: 'w', id: 'w' });
    expect(parseDrillKey('c')).toEqual({ kind: 'w', id: 'c' });
    expect(parseDrillKey('x:y')).toEqual({ kind: 'w', id: 'x:y' });
  });
});

describe('each drill sees its own flat namespace', () => {
  const card = { reviews: 1, lastReview: '2026-09-07' };
  const state: DrillCards = { 'w:好': card, 'c:hablar:pres': card, '朋': card };

  it('strips the prefix on the way out, legacy keys included', () => {
    expect(Object.keys(drillView(state, 'w')).sort()).toEqual(['好', '朋']);
    expect(Object.keys(drillView(state, 'c'))).toEqual(['hablar:pres']);
  });

  /**
   * THE ONE THAT KEEPS A SHARED COLUMN HONEST. Handwriting saving its own cards over the whole
   * entry would delete a learner's conjugation progress for that language, silently, on every
   * character they practise.
   */
  it('replaces one drill and leaves the others alone', () => {
    const next = drillWrite(state, 'w', { 好: { reviews: 9 } });
    expect(next['c:hablar:pres']).toEqual(card);      // untouched
    expect(next['w:好']).toEqual({ reviews: 9 });      // replaced
    expect(next['朋']).toBeUndefined();                // legacy key absorbed, not duplicated
  });

  it('normalises a legacy key when that drill is written', () => {
    const next = drillWrite(state, 'w', drillView(state, 'w'));
    expect(Object.keys(next).sort()).toEqual(['c:hablar:pres', 'w:好', 'w:朋']);
  });

  it('round-trips through view and write unchanged', () => {
    const view = drillView(state, 'c');
    expect(drillView(drillWrite(state, 'c', view), 'c')).toEqual(view);
  });
});

describe('merging: a card is owned whole, and the rule is commutative', () => {
  const older = { lastReview: '2026-09-01', reviews: 2, stability: 3, difficulty: 5, lapses: 0 };
  const newer = { lastReview: '2026-09-05', reviews: 3, stability: 9, difficulty: 6, lapses: 1 };

  it('takes the whole card from the later review, never a field-wise blend', () => {
    const merged = mergeDrillCards({ 好: older }, { 好: newer });
    expect(merged.好).toEqual(newer);
    // The blend would keep the higher stability AND the lower lapse count — a state neither
    // device was ever in. This is the same trap srsStateMerge documents for the streak.
    expect(merged.好.lapses).toBe(1);
  });

  it('unions characters only one side has', () => {
    const merged = mergeDrillCards({ 好: older }, { 朋: newer });
    expect(Object.keys(merged).sort()).toEqual(['好', '朋'].sort());
  });

  it('is commutative — the whole reason ties do not fall back to "mine"', () => {
    const a: DrillCards = { 好: older, 朋: newer, 友: {} };
    const b: DrillCards = { 好: newer, 友: { reviews: 1, lastReview: '2026-09-03' }, 学: older };
    expect(mergeDrillCards(a, b)).toEqual(mergeDrillCards(b, a));
  });

  it('is commutative even when two cards share a review date', () => {
    const x = { lastReview: '2026-09-05', reviews: 4, stability: 2 };
    const y = { lastReview: '2026-09-05', reviews: 4, stability: 8 };
    expect(mergeDrillCards({ 好: x }, { 好: y })).toEqual(mergeDrillCards({ 好: y }, { 好: x }));
  });

  /** Fully identical histories still have to resolve the same way on both devices. */
  it('is commutative for cards that are indistinguishable by history', () => {
    const x = { lastReview: '2026-09-05', reviews: 4, stability: 2, dueAt: '2026-09-08' };
    const y = { lastReview: '2026-09-05', reviews: 4, stability: 2, dueAt: '2026-09-09' };
    expect(mergeDrillCards({ 好: x }, { 好: y })).toEqual(mergeDrillCards({ 好: y }, { 好: x }));
  });

  it('is idempotent, because the merge gets written back and merged again', () => {
    const a: DrillCards = { 好: older, 朋: newer };
    const b: DrillCards = { 好: newer, 友: older };
    const once = mergeDrillCards(a, b);
    expect(mergeDrillCards(once, b)).toEqual(once);
    expect(mergeDrillCards(once, once)).toEqual(once);
  });

  it('merges language by language', () => {
    const merged = mergeDrillState({ zh: { 好: older } }, { zh: { 好: newer }, ja: { 学: older } });
    expect(merged.zh?.好).toEqual(newer);
    expect(merged.ja?.学).toEqual(older);
  });

  it('is commutative across languages too', () => {
    const a = { zh: { 好: older }, ja: { 学: newer } };
    const b = { zh: { 好: newer, 朋: older } };
    expect(mergeDrillState(a, b)).toEqual(mergeDrillState(b, a));
  });
});
