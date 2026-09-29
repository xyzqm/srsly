/**
 * @vitest-environment jsdom
 *
 * jsdom, not node, for the reason `tests/offlineWrites.test.ts` gives: every read and write in
 * this module is guarded on `typeof localStorage === 'undefined'`, so under the default node
 * environment they are silent no-ops and a test asserting what was kept would pass while
 * proving nothing at all.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACTIVITY_WINDOW_DAYS,
  getActivityLog,
  setActivityLog,
  logGraded,
  type DayActivity,
} from '@/lib/activityLog';

/** Mirrors `cutoff()`'s own arithmetic — local date, `setDate`, zero-padded. */
function isoDaysAgo(n: number): string {
  const x = new Date();
  x.setDate(x.getDate() - n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

const day = (d: string, n: number): DayActivity => ({ d, n });

beforeEach(() => {
  localStorage.clear();
});

describe('the retention window is long enough to answer a year-level question', () => {
  /**
   * THE CLAIM THIS FILE EXISTS FOR. The window was 120 days, so any look-back longer than four
   * months was impossible by construction — not unimplemented, impossible, because the data had
   * already been deleted by the time it was asked for.
   */
  it('keeps at least a full year', () => {
    expect(ACTIVITY_WINDOW_DAYS).toBeGreaterThanOrEqual(366);
  });

  /**
   * Brackets the window from both sides, which is what makes this a measurement rather than a
   * restatement of the constant. The lower case is ALSO the control for the old value: a day 399
   * days ago cannot survive a 120-day window, so putting the constant back fails here.
   */
  it('keeps a day from almost a year ago and drops one from beyond the window', () => {
    setActivityLog([
      day(isoDaysAgo(399), 5),
      day(isoDaysAgo(ACTIVITY_WINDOW_DAYS + 1), 9),
    ]);
    const kept = getActivityLog().map(e => e.d);
    expect(kept).toContain(isoDaysAgo(399));
    expect(kept).not.toContain(isoDaysAgo(ACTIVITY_WINDOW_DAYS + 1));
  });
});

describe('pruning is a deletion, not a filter on a graph', () => {
  /**
   * THE MECHANISM, AND THE HALF THAT IS EASY TO MISS. `getActivityLog` filtering on read looks
   * like a display concern — the data is still in localStorage, so nothing is lost. It is not:
   * `logGraded` reads the log THROUGH that filter, appends today, and writes the result back. So
   * the first review after a day falls out of the window is what removes it from storage for
   * good, and no UI change can recover it afterwards.
   */
  it('logGraded writes back the PRUNED log, destroying anything outside the window', () => {
    const inside = isoDaysAgo(ACTIVITY_WINDOW_DAYS - 10);
    const outside = isoDaysAgo(ACTIVITY_WINDOW_DAYS + 10);
    setActivityLog([day(outside, 7), day(inside, 4)]);

    // Both are in storage before the review — otherwise this test would pass on a bad setter.
    expect(JSON.parse(localStorage.getItem('srsly-activity-log')!)).toHaveLength(2);

    logGraded(1);

    const stored = JSON.parse(localStorage.getItem('srsly-activity-log')!) as DayActivity[];
    const days = stored.map(e => e.d);
    expect(days).toContain(inside);
    expect(days).not.toContain(outside);   // gone from DISK, not merely from a query
  });

  it('a day inside the window survives any number of reviews', () => {
    const inside = isoDaysAgo(ACTIVITY_WINDOW_DAYS - 1);
    setActivityLog([day(inside, 4)]);
    logGraded(1);
    logGraded(1);
    logGraded(1);
    expect(getActivityLog().find(e => e.d === inside)?.n).toBe(4);
  });
});

describe('the cost of keeping a year', () => {
  /**
   * Pins the figure quoted in the module docstring, so widening the window again is a decision
   * with a number attached rather than a drift. The lower bound is the control: without it the
   * assertion would pass on an empty array, which is the shape of a test that measures nothing.
   */
  it('a full window of real entries serializes to about 10 kB', () => {
    const full = Array.from({ length: ACTIVITY_WINDOW_DAYS }, (_, i) => day(isoDaysAgo(i), 37));
    const bytes = new TextEncoder().encode(JSON.stringify(full)).length;
    expect(bytes).toBeGreaterThan(8_000);
    expect(bytes).toBeLessThan(12_000);
  });
});
