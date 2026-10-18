/**
 * @vitest-environment jsdom
 *
 * ⚠ THE PRAGMA HAS TO BE THE FIRST COMMENT IN THE FILE, AND THAT IS WHY THIS IS ITS OWN FILE.
 *
 * `vitest.config.mts` sets `environment: 'node'`, where `localStorage` does not exist — so
 * `logLesson` returns at its first guard and asserts nothing. This exact trap is recorded in
 * CLAUDE.md against `tests/offlineWrites.test.ts`, and it caught this file too: the test below
 * lived at the bottom of `tests/xp.test.ts` under a mid-file pragma, which vitest ignores, and
 * it passed without ever writing anything.
 *
 * The control is the first assertion: if the environment is wrong, it fails loudly instead of
 * silently proving nothing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { logLesson, logGraded, getActivityLog, setActivityLog } from '@/lib/activityLog';

describe('logLesson', () => {
  beforeEach(() => setActivityLog([]));

  it('is running somewhere localStorage exists', () => {
    expect(typeof localStorage, 'these assertions are vacuous under the node environment')
      .toBe('object');
  });

  it('records a lesson without touching the card count', () => {
    logLesson();
    logLesson();
    const [today] = getActivityLog();
    expect(today.l).toBe(2);
    // The review heatmap reads `n` and its own legend says "cards graded". A lesson is not
    // one, and folding it in here is the shortcut `DayActivity.l` exists to refuse.
    expect(today.n).toBe(0);
  });

  it('keeps cards and lessons on the same day apart', () => {
    logGraded(7);
    logLesson();
    const [today] = getActivityLog();
    expect(today.n).toBe(7);
    expect(today.l).toBe(1);
  });

  it('leaves a day with no lessons carrying no l at all', () => {
    logGraded(3);
    expect(getActivityLog()[0].l).toBeUndefined();
  });
});
