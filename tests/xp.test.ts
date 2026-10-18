/**
 * XP is derived, so the tests are about the DERIVATION rather than about a stored number.
 *
 * Two properties carry the design and both are easy to break by accident: the window must be
 * the same week for everyone looking at it, and the figure must never be able to go down.
 */
import { describe, it, expect } from 'vitest';
import { xpIn, xpThisWeek, weekBounds, XP_PER_CARD, XP_PER_PASSAGE, XP_PER_LESSON } from '@/lib/xp';
import { mergeActivity } from '@/lib/activityLog';

const log = [
  { d: '2026-10-12', n: 20 },
  { d: '2026-10-14', n: 10, l: 2 },
  { d: '2026-10-19', n: 99 },          // the NEXT week — must not be counted
  { d: '2026-10-05', n: 50, l: 9 },    // the PREVIOUS week — must not be counted
];
const passageDates = ['2026-10-13', '2026-10-15', '2026-10-04'];

describe('the weekly window', () => {
  it('runs Monday to Sunday', () => {
    // 2026-10-14 is a Wednesday.
    expect(weekBounds('2026-10-14')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });

  it('gives every day of one week the SAME window', () => {
    // The property that makes two people's numbers comparable. A rolling seven days would
    // give each of these a different answer, so a shared total could not be added up.
    const days = ['2026-10-12', '2026-10-14', '2026-10-18'];
    const windows = new Set(days.map(d => JSON.stringify(weekBounds(d))));
    expect(windows.size).toBe(1);
  });

  it('treats Sunday as the END of its week, not the start', () => {
    // getUTCDay() returns 0 for Sunday, which is the off-by-one the expression exists to fix.
    expect(weekBounds('2026-10-18')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(weekBounds('2026-10-19').from).toBe('2026-10-19');
  });

  it('crosses a month boundary without losing days', () => {
    expect(weekBounds('2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });
});

describe('what XP counts', () => {
  it('adds the three sources with their own weights', () => {
    const x = xpThisWeek({ log, passageDates }, '2026-10-14');
    expect(x.cards).toBe(30);        // 20 + 10, the two days inside the week
    expect(x.lessons).toBe(2);
    expect(x.passages).toBe(2);      // the 4 Oct one is the previous week
    expect(x.total).toBe(30 * XP_PER_CARD + 2 * XP_PER_PASSAGE + 2 * XP_PER_LESSON);
  });

  it('excludes both neighbouring weeks, not just the earlier one', () => {
    // The 19 Oct row is 99 cards. An off-by-one at the END of the window is the easier
    // mistake and the one that would let next week's work leak into this week's total.
    const x = xpThisWeek({ log, passageDates }, '2026-10-14');
    expect(x.cards).toBeLessThan(99);
  });

  it('never goes negative on a corrupt log', () => {
    // Hand-edited or half-written storage must not be able to SUBTRACT XP.
    const x = xpIn({ log: [{ d: '2026-10-14', n: -500, l: -9 }], passageDates: [] },
      '2026-10-12', '2026-10-18');
    expect(x.total).toBe(0);
  });

  it('counts a lesson day whose card count is zero', () => {
    // The whole reason `l` exists: a day spent entirely in the Learn tab has n = 0, and
    // before this it was indistinguishable from a day off.
    const x = xpIn({ log: [{ d: '2026-10-14', n: 0, l: 3 }], passageDates: [] },
      '2026-10-12', '2026-10-18');
    expect(x.total).toBe(3 * XP_PER_LESSON);
  });

  it('lets any one path reach a reasonable week on its own', () => {
    // The stated constraint on the weights: no route dominates. A 20-card session, a passage
    // and a lesson stay within a factor of two of each other.
    const session = 20 * XP_PER_CARD;
    for (const other of [XP_PER_PASSAGE, XP_PER_LESSON]) {
      expect(session / other).toBeLessThan(2);
      expect(other / session).toBeLessThan(2);
    }
  });
});

describe('lesson counts survive the sync merge', () => {
  it('maxes l per day, independently of n', () => {
    // Two devices, two different days' work. Tying `l` to whichever row won on `n` would let
    // a card-heavy device suppress the other one's lessons.
    const merged = mergeActivity(
      [{ d: '2026-10-14', n: 50, l: 1 }],
      [{ d: '2026-10-14', n: 10, l: 4 }],
    );
    expect(merged).toEqual([{ d: '2026-10-14', n: 50, l: 4 }]);
  });

  it('is idempotent, because a device writes its merged log back', () => {
    const a = [{ d: '2026-10-14', n: 50, l: 1 }];
    const b = [{ d: '2026-10-14', n: 10, l: 4 }];
    expect(mergeActivity(mergeActivity(a, b), b)).toEqual(mergeActivity(a, b));
  });

  it('leaves a pre-XP log byte-identical rather than growing l: 0 on every row', () => {
    const old = [{ d: '2026-10-12', n: 20 }, { d: '2026-10-14', n: 10 }];
    expect(mergeActivity(old, [])).toEqual(old);
  });
});
