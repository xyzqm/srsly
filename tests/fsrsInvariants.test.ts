import { describe, it, expect } from 'vitest';
import { fsrsSchedule, fsrsNextInterval, DEFAULT_SRS_SETTINGS } from '@/lib/fsrs';
import type { DeckWord } from '@/lib/types';

/**
 * Properties the scheduler must hold for EVERY card, swept over a grid rather than checked on
 * one fixture. A scheduler bug is almost never visible at the default state; it shows up on
 * the very stable card, the very difficult one, or the one that is months overdue.
 */

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const STABILITIES = [0.2, 1, 3, 10, 40, 200, 1000];
const DIFFICULTIES = [1, 3, 5, 7, 10];
const ELAPSED = [0, 1, 5, 30, 200, 2000];

function* grid(): Generator<DeckWord> {
  for (const stability of STABILITIES)
    for (const difficulty of DIFFICULTIES)
      for (const e of ELAPSED)
        yield {
          id: 'g', h: 'g', p: '', m: '',
          reviews: 5, stability, difficulty, phase: 'review',
          lastReview: daysAgo(e), dueAt: daysAgo(0),
        };
}

describe('every graded card lands in a valid state', () => {
  it('difficulty stays within 1–10', () => {
    for (const card of grid())
      for (const g of [1, 2, 3, 4] as const) {
        const d = fsrsSchedule(card, g).difficulty!;
        expect(d, `S=${card.stability} D=${card.difficulty} grade=${g}`).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(10);
      }
  });

  it('stability stays positive and finite', () => {
    for (const card of grid())
      for (const g of [1, 2, 3, 4] as const) {
        const s = fsrsSchedule(card, g).stability!;
        expect(Number.isFinite(s), `S=${card.stability} grade=${g}`).toBe(true);
        expect(s).toBeGreaterThan(0);
      }
  });

  it('never schedules beyond the configured maximum', () => {
    const settings = { ...DEFAULT_SRS_SETTINGS, maxIntervalDays: 90 };
    for (const card of grid())
      for (const g of [2, 3, 4] as const)
        expect(fsrsNextInterval(card, g, settings)).toBeLessThanOrEqual(90);
  });
});

describe('forgetting is never rewarded', () => {
  it('Again never increases stability', () => {
    for (const card of grid()) {
      const after = fsrsSchedule(card, 1).stability!;
      expect(after, `S=${card.stability} D=${card.difficulty} lastReview=${card.lastReview}`)
        .toBeLessThanOrEqual(card.stability!);
    }
  });

  it('Again never gives a longer interval than Good', () => {
    for (const card of grid()) {
      expect(fsrsNextInterval(card, 1)).toBeLessThanOrEqual(fsrsNextInterval(card, 3));
    }
  });
});

describe('grades stay ordered', () => {
  it('Hard ≤ Good ≤ Easy for every card', () => {
    for (const card of grid()) {
      const h = fsrsNextInterval(card, 2), g = fsrsNextInterval(card, 3), e = fsrsNextInterval(card, 4);
      expect(h, `S=${card.stability} D=${card.difficulty}`).toBeLessThanOrEqual(g);
      expect(g).toBeLessThanOrEqual(e);
    }
  });
});

describe('a card with no recorded lastReview still learns', () => {
  // Legacy cards migrated by the stability bootstrap carry no lastReview. Assuming "reviewed
  // just now" made retrievability 1, which zeroes the stability gain for every passing grade.
  const migrated: DeckWord = {
    id: 'm', h: 'm', p: '', m: '',
    reviews: 4, stability: 8, difficulty: 5, phase: 'review', dueAt: daysAgo(0),
  };

  it('grows stability on a pass', () => {
    expect(fsrsSchedule(migrated, 3).stability!).toBeGreaterThan(8);
  });

  it('still orders the grades', () => {
    const h = fsrsSchedule(migrated, 2).stability!;
    const g = fsrsSchedule(migrated, 3).stability!;
    const e = fsrsSchedule(migrated, 4).stability!;
    expect(h).toBeLessThan(g);
    expect(g).toBeLessThan(e);
  });

  it('still shrinks on a lapse', () => {
    expect(fsrsSchedule(migrated, 1).stability!).toBeLessThanOrEqual(8);
  });
});
