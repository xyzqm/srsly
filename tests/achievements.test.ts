import { describe, it, expect } from 'vitest';
import {
  computeStats, evaluate, isMastered, isRescuedLeech, MASTERY_STABILITY_DAYS,
} from '@/lib/achievements';
import { unannounced } from '@/lib/achievementsSeen';
import type { DeckWord, SRSState } from '@/lib/types';

const LEECH = 8;

// CLAUDE.md's fixture trap: a DeckWord without `lastReview` looks to FSRS like it was
// reviewed one second ago. None of these rules read elapsed time, but the fixtures carry
// lastReview anyway so they stay honest if one ever does.
const card = (over: Partial<DeckWord> = {}): DeckWord =>
  ({ id: 'c', h: '词', p: '', m: 'word', lastReview: '2026-06-01', ...over });

const srs = (over: Partial<SRSState> = {}): SRSState =>
  ({ streak: 0, lastVisit: '2026-08-22', todayScore: -1, todayScoreDate: '2026-08-22', ...over });

describe('mastery is stability, not review count', () => {
  it('counts a card that would survive a month', () => {
    expect(isMastered(card({ stability: MASTERY_STABILITY_DAYS, reviews: 1 }))).toBe(true);
  });

  // The reason the rule is not `reviews >= n`: eight passes on a card you keep forgetting is
  // not mastery, and FSRS already measures the difference.
  it('does not count a much-reviewed card that keeps being forgotten', () => {
    expect(isMastered(card({ reviews: 12, lapses: 9, stability: 2 }))).toBe(false);
  });

  it('does not count a brand-new card', () => {
    expect(isMastered(card())).toBe(false);
    expect(isMastered(card({ stability: 40 }))).toBe(false);   // stability but never reviewed
  });
});

describe('a rescued leech is one that was stuck and is not now', () => {
  it('counts a healed card', () => {
    expect(isRescuedLeech(card({ lapses: LEECH, leech: false }), LEECH)).toBe(true);
  });

  // The flag being absent is not evidence on its own — most cards were never stuck.
  it('does not count a card that was never a leech', () => {
    expect(isRescuedLeech(card({ lapses: 1 }), LEECH)).toBe(false);
  });

  it('does not count one that is still flagged or still paused', () => {
    expect(isRescuedLeech(card({ lapses: 10, leech: true }), LEECH)).toBe(false);
    expect(isRescuedLeech(card({ lapses: 10, paused: true }), LEECH)).toBe(false);
  });
});

describe('computeStats reads only what is already persisted', () => {
  it('totals across every language deck', () => {
    const stats = computeStats({
      decks: {
        es: [card({ h: 'casa', stability: 60, reviews: 4 }), card({ h: 'perro' })],
        zh: [card({ h: '猫', stability: 90, reviews: 9 })],
      },
      srs: srs({ streak: 12, sessions: 30, byLanguage: { es: { streak: 12 }, zh: { streak: 4 } } as never }),
      leechThreshold: LEECH,
    });
    expect(stats.mastered).toBe(2);
    expect(stats.deckSize).toBe(3);
    expect(stats.languagesStudied).toBe(2);
    expect(stats.bestLanguageStreak).toBe(12);
    expect(stats.sessions).toBe(30);
  });

  it('survives an empty deck and a state written before per-language streaks', () => {
    const stats = computeStats({ decks: {}, srs: srs(), leechThreshold: LEECH });
    expect(stats).toMatchObject({ mastered: 0, deckSize: 0, bestLanguageStreak: 0, languagesStudied: 0 });
  });

  it('does not count an empty deck as a language studied', () => {
    const stats = computeStats({ decks: { es: [], fr: [card()] }, srs: srs(), leechThreshold: LEECH });
    expect(stats.languagesStudied).toBe(1);
  });
});

describe('evaluate splits earned from close', () => {
  const stats = computeStats({
    decks: { es: Array.from({ length: 60 }, (_, i) => card({ h: `w${i}`, stability: 60, reviews: 3 })) },
    srs: srs({ streak: 8, sessions: 12 }),
    leechThreshold: LEECH,
  });

  it('earns every tier at or below what you have', () => {
    const { earned } = evaluate(stats);
    const ids = earned.map(a => a.id);
    expect(ids).toContain('mastered-10');
    expect(ids).toContain('mastered-50');
    expect(ids).not.toContain('mastered-100');
    expect(ids).toContain('streak-7');
    expect(ids).not.toContain('streak-30');
  });

  // Showing what is close is most of the point — a trophy cabinet does not get anyone back.
  it('orders the not-yet-earned by how close they are', () => {
    const { next } = evaluate(stats);
    const fractions = next.map(a => a.have / a.need);
    expect([...fractions].sort((a, b) => b - a)).toEqual(fractions);
  });

  it('reports progress so the UI can say 8/30', () => {
    const { next } = evaluate(stats);
    const streak30 = next.find(a => a.id === 'streak-30')!;
    expect(streak30).toMatchObject({ have: 8, need: 30, earned: false });
  });

  it('earns nothing on a fresh account', () => {
    const fresh = computeStats({ decks: {}, srs: srs(), leechThreshold: LEECH });
    expect(evaluate(fresh).earned).toHaveLength(0);
  });
});

describe('announcing happens once', () => {
  it('only reports what has not been seen', () => {
    expect(unannounced(['a', 'b', 'c'], new Set(['a']))).toEqual(['b', 'c']);
  });

  it('reports nothing when everything is seen', () => {
    expect(unannounced(['a', 'b'], new Set(['a', 'b']))).toEqual([]);
  });
});
