/**
 * @vitest-environment jsdom
 *
 * jsdom because `loadDay`/`bumpCount` read localStorage directly — that synchronous access is
 * the whole reason this module does not go through the async storage layer, so testing it
 * without a real localStorage would test something else.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  mergeCounts, totals, loadDay, saveDay, bumpCount, getTodayCounts, deviceId,
  type DayCounts,
} from '@/lib/reviewCounts';
import { todayStr } from '@/lib/deck';

/**
 * The daily new-card budget, once it has to survive two devices.
 *
 * It was a flat `{ date, newCount, reviewCount }` in localStorage while the deck it rations
 * syncs — so a laptop counted to 20 and a phone counted to 20 and the learner got 40.
 *
 * The merge is where the correctness lives, and both obvious answers are wrong: a SUM
 * double-counts on replay, a MAX under-enforces two devices used at once. These pin the
 * per-device tally that is neither.
 */

const TODAY = todayStr();
const day = (by: DayCounts['by'], date = TODAY): DayCounts => ({ date, by });

beforeEach(() => { localStorage.clear(); });

describe('the merge is idempotent — a replay cannot inflate the count', () => {
  /**
   * THE PROPERTY A SUM FAILS. A device writes its merged copy back, so the cloud then holds
   * the merge; merging again must change nothing. `a+b` becoming `a+b+b` is exactly how the
   * activity log would have inflated, and a budget that grows on every sync would ration
   * nothing at all.
   */
  it('merging a result back into either input changes nothing', () => {
    const a = day({ laptop: { n: 12, r: 30 } });
    const b = day({ phone: { n: 8, r: 5 } });
    const once = mergeCounts(a, b);
    expect(mergeCounts(once, b)).toEqual(once);
    expect(mergeCounts(once, a)).toEqual(once);
    expect(mergeCounts(once, once)).toEqual(once);
  });

  it('is order-independent', () => {
    const a = day({ laptop: { n: 12, r: 0 } });
    const b = day({ phone: { n: 8, r: 0 } });
    expect(mergeCounts(a, b)).toEqual(mergeCounts(b, a));
  });
});

describe('the total is exact — a plain MAX would hand back a spent budget', () => {
  /**
   * THE PROPERTY A MAX FAILS. Twelve on one device and eight on another is twenty spent. A
   * per-day maximum reports twelve, so the learner is handed eight cards the budget had
   * already paid out — which is the one thing a budget exists to prevent.
   */
  it('sums two devices rather than taking the larger', () => {
    const merged = mergeCounts(day({ laptop: { n: 12, r: 0 } }), day({ phone: { n: 8, r: 0 } }));
    expect(totals(merged).newCount).toBe(20);
  });

  it('does not double a single device seen twice', () => {
    const merged = mergeCounts(day({ laptop: { n: 12, r: 3 } }), day({ laptop: { n: 12, r: 3 } }));
    expect(totals(merged)).toMatchObject({ newCount: 12, reviewCount: 3 });
  });

  /** The same device with two views of itself takes the higher — it only ever grows. */
  it('takes the higher of one device disagreeing with itself', () => {
    const merged = mergeCounts(day({ laptop: { n: 5, r: 1 } }), day({ laptop: { n: 12, r: 0 } }));
    expect(totals(merged)).toMatchObject({ newCount: 12, reviewCount: 1 });
  });
});

describe('days do not bleed into each other', () => {
  it('the later date wins outright rather than merging', () => {
    const yesterday = day({ laptop: { n: 20, r: 50 } }, '2026-09-01');
    const today = day({ phone: { n: 1, r: 0 } }, '2026-09-02');
    expect(mergeCounts(yesterday, today)).toEqual(today);
    expect(mergeCounts(today, yesterday)).toEqual(today);
  });

  it('reads a stored day from another date as zero', () => {
    saveDay(day({ laptop: { n: 20, r: 0 } }, '2020-01-01'));
    expect(getTodayCounts()).toMatchObject({ newCount: 0, reviewCount: 0 });
  });

  it('handles a null side', () => {
    const a = day({ laptop: { n: 3, r: 0 } });
    expect(mergeCounts(a, null)).toEqual(a);
    expect(mergeCounts(null, a)).toEqual(a);
    expect(totals(mergeCounts(null, null))).toMatchObject({ newCount: 0, reviewCount: 0 });
  });
});

describe('a device only ever increments its own entry', () => {
  it('leaves another device untouched', () => {
    saveDay(day({ 'other-device': { n: 7, r: 2 } }));
    bumpCount('new');
    const stored = loadDay();
    expect(stored.by['other-device']).toEqual({ n: 7, r: 2 });
    expect(stored.by[deviceId()]).toEqual({ n: 1, r: 0 });
    // And the budget sees both.
    expect(getTodayCounts().newCount).toBe(8);
  });

  it('counts new and review separately', () => {
    bumpCount('new'); bumpCount('new'); bumpCount('review');
    expect(getTodayCounts()).toMatchObject({ newCount: 2, reviewCount: 1 });
  });

  it('keeps one stable device id across calls', () => {
    expect(deviceId()).toBe(deviceId());
  });
});

describe('the pre-sync value is carried over, not discarded', () => {
  /**
   * The old shape had no device dimension. Dropping it would hand a full budget back to
   * anyone mid-day on the release that introduces this; folding it into THIS device's entry
   * is the honest reading, because those cards were in fact studied here.
   */
  it('migrates a flat {date,newCount,reviewCount} into this device', () => {
    localStorage.setItem('srsly-review-counts',
      JSON.stringify({ date: TODAY, newCount: 14, reviewCount: 60 }));
    expect(getTodayCounts()).toMatchObject({ newCount: 14, reviewCount: 60 });
    expect(loadDay().by[deviceId()]).toEqual({ n: 14, r: 60 });
  });

  it('ignores a flat value from an earlier day', () => {
    localStorage.setItem('srsly-review-counts',
      JSON.stringify({ date: '2020-01-01', newCount: 14, reviewCount: 60 }));
    expect(getTodayCounts().newCount).toBe(0);
  });

  it('reads corrupt storage as an empty day rather than throwing', () => {
    for (const bad of ['{not json', 'null', '[]', '"x"', '5']) {
      localStorage.setItem('srsly-review-counts', bad);
      expect(() => getTodayCounts()).not.toThrow();
      expect(getTodayCounts().newCount).toBe(0);
    }
  });
});
