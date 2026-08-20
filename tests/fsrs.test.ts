import { describe, it, expect } from 'vitest';
import { fsrsSchedule, fsrsNextInterval, fmtInterval, DEFAULT_SRS_SETTINGS } from '@/lib/fsrs';
import type { DeckWord } from '@/lib/types';

/**
 * A graduated card that was genuinely last seen some days ago.
 *
 * `lastReview` is load-bearing and easy to leave out: `fsrsSchedule` computes elapsed days as
 * `daysBetween(word.lastReview ?? today, today)`, so a fixture without it looks like a card
 * reviewed one second ago. Retrievability is then 1, and FSRS correctly declines to grow
 * stability at all — Hard, Good and Easy come out identical. That is the formula working, not
 * a bug, but it makes for a fixture that tests nothing.
 */
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const reviewed = (over: Partial<DeckWord> = {}): DeckWord => ({
  id: 'x', h: 'x', p: '', m: '',
  reviews: 5, stability: 10, difficulty: 5, phase: 'review',
  lastReview: daysAgo(10), dueAt: daysAgo(0),
  ...over,
});

describe('grades move the interval in the right direction', () => {
  const days = (g: 1 | 2 | 3 | 4) => fsrsNextInterval(reviewed(), g);

  it('Again < Hard < Good < Easy', () => {
    expect(days(1)).toBeLessThan(days(2));
    expect(days(2)).toBeLessThan(days(3));
    expect(days(3)).toBeLessThan(days(4));
  });

  it('a passing grade grows stability; a failing one shrinks it', () => {
    const before = 10;
    expect(fsrsSchedule(reviewed(), 3).stability!).toBeGreaterThan(before);
    expect(fsrsSchedule(reviewed(), 4).stability!).toBeGreaterThan(fsrsSchedule(reviewed(), 3).stability!);
    expect(fsrsSchedule(reviewed(), 1).stability!).toBeLessThan(before);
  });

  it('a harder card grows more slowly than an easy one', () => {
    const easy = fsrsSchedule(reviewed({ difficulty: 2 }), 3).stability!;
    const hard = fsrsSchedule(reviewed({ difficulty: 9 }), 3).stability!;
    expect(hard).toBeLessThan(easy);
  });

  it('Again sends a graduated card back to a sub-day relearning step', () => {
    // The reading tab reports this as "1 min", and it is why every missed word used to
    // claim "1 day" — the caller clamped with Math.max(1, …) and swallowed the step.
    expect(days(1)).toBeLessThan(1);
    expect(fsrsSchedule(reviewed(), 1).phase).toBe('learning');
  });
});

describe('minDaysOut mirrors what gradeCard persists', () => {
  it('floors a graduated card without touching a learning step', () => {
    const graduated = fsrsNextInterval(reviewed(), 3, DEFAULT_SRS_SETTINGS, { minDaysOut: 1 });
    expect(graduated).toBeGreaterThanOrEqual(1);
    // A relearning step keeps its minutes — the floor deliberately does not apply.
    expect(fsrsNextInterval(reviewed(), 1, DEFAULT_SRS_SETTINGS, { minDaysOut: 1 })).toBeLessThan(1);
  });
});

describe('a new card starts in learning, not review', () => {
  it('has no stability until it graduates', () => {
    const fresh: DeckWord = { id: 'n', h: 'n', p: '', m: '' };
    const out = fsrsSchedule(fresh, 3);
    expect(out.phase).toBe('learning');
    expect(out.dueAtMs).toBeDefined();
  });
});

describe('maxIntervalDays is respected', () => {
  it('never schedules beyond the cap', () => {
    const veryStable = reviewed({ stability: 100_000, difficulty: 1 });
    const capped = fsrsNextInterval(veryStable, 4, { ...DEFAULT_SRS_SETTINGS, maxIntervalDays: 30 });
    expect(capped).toBeLessThanOrEqual(30);
  });
});

describe('fmtInterval', () => {
  it.each([
    [1 / 1440, '1 min'],
    [1 / 24,   '1 hr'],
    [1,        '1 day'],
    [5,        '5 days'],
    [21,       '3 wks'],
    [365,      '12 mo'],
  ])('%s days → %s', (d, want) => expect(fmtInterval(d as number)).toBe(want));
});
