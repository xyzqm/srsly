import { describe, it, expect } from 'vitest';
import { mergeSRSState } from '@/lib/srsStateMerge';
import type { SRSState } from '@/lib/types';

/**
 * `srs_state` once two devices share it.
 *
 * It was one blob, last-writer-wins, so a device holding a stale copy reverted the whole
 * column on its next save — study on the laptop, open the phone, watch the streak walk
 * backwards with nothing logged anywhere.
 *
 * The merge is where the correctness lives, and the obvious answer is wrong for the one field
 * anybody watches: a per-field MAX cannot represent a streak that RESET, so a stale 40 would
 * resurrect a streak the learner had already lost. These pin the rule that is not max.
 */

const base = (o: Partial<SRSState> = {}): SRSState => ({
  streak: 0, lastVisit: '2026-09-01', todayScore: -1, todayScoreDate: '2026-09-01', ...o,
});

describe('the streak is owned, not maximised', () => {
  /** THE PROPERTY MAX FAILS. A broken streak must be able to go down. */
  it('lets a reset streak win over a stale higher one', () => {
    const stale  = base({ streak: 40, lastActive: '2026-09-01' });
    const reset  = base({ streak: 1,  lastActive: '2026-09-05' });
    expect(mergeSRSState(stale, reset).streak).toBe(1);
    expect(mergeSRSState(reset, stale).streak).toBe(1);
  });

  it('keeps a grown streak against a stale device', () => {
    const stale = base({ streak: 9,  lastActive: '2026-09-01' });
    const grown = base({ streak: 10, lastActive: '2026-09-05' });
    expect(mergeSRSState(stale, grown).streak).toBe(10);
  });

  /** The streak and the day it is measured against must come from the SAME side. */
  it('carries lastActive with the streak it explains', () => {
    const a = base({ streak: 40, lastActive: '2026-09-01' });
    const b = base({ streak: 1,  lastActive: '2026-09-05' });
    const m = mergeSRSState(a, b);
    expect({ streak: m.streak, lastActive: m.lastActive }).toEqual({ streak: 1, lastActive: '2026-09-05' });
  });

  it('takes the higher count when both were active the same day', () => {
    const a = base({ streak: 3, lastActive: '2026-09-05' });
    const b = base({ streak: 5, lastActive: '2026-09-05' });
    expect(mergeSRSState(a, b).streak).toBe(5);
  });

  /** Pre-`lastActive` states fall back to todayScoreDate, as useSRS already does — otherwise
   *  an old state reads as never-active and is outranked by anything. */
  it('falls back to todayScoreDate when lastActive is absent', () => {
    const old   = base({ streak: 12, todayScoreDate: '2026-09-06' });
    const newer = base({ streak: 2,  lastActive: '2026-09-04' });
    expect(mergeSRSState(old, newer).streak).toBe(12);
  });
});

describe('the merge is safe to replay', () => {
  /** A device writes its merged copy back, so merging again must change nothing. */
  it('is idempotent', () => {
    const a = base({ streak: 4, lastActive: '2026-09-04', sessions: 3, forgivenDays: ['2026-09-02'] });
    const b = base({ streak: 7, lastActive: '2026-09-05', sessions: 9, accuracy: [{ d: '2026-09-05', right: 4, total: 5 }] });
    const once = mergeSRSState(a, b);
    expect(mergeSRSState(once, a)).toEqual(once);
    expect(mergeSRSState(once, b)).toEqual(once);
    expect(mergeSRSState(once, once)).toEqual(once);
  });

  it('is order-independent', () => {
    const a = base({ streak: 4, lastActive: '2026-09-04', sessions: 3 });
    const b = base({ streak: 7, lastActive: '2026-09-05', sessions: 9 });
    expect(mergeSRSState(a, b)).toEqual(mergeSRSState(b, a));
  });

  it('handles a null side', () => {
    const a = base({ streak: 2 });
    expect(mergeSRSState(a, null)).toEqual(a);
    expect(mergeSRSState(null, a)).toEqual(a);
  });
});

describe('the other fields', () => {
  it('takes the later lastVisit regardless of who owns the streak', () => {
    const a = base({ streak: 9, lastActive: '2026-09-05', lastVisit: '2026-09-05' });
    const b = base({ streak: 1, lastActive: '2026-09-01', lastVisit: '2026-09-06' });
    const m = mergeSRSState(a, b);
    expect(m.streak).toBe(9);          // studied more recently
    expect(m.lastVisit).toBe('2026-09-06');  // but opened more recently over there
  });

  it("keeps today's score with its own date, never across days", () => {
    const yest = base({ todayScore: 90, todayScoreDate: '2026-09-04' });
    const today = base({ todayScore: 10, todayScoreDate: '2026-09-05' });
    const m = mergeSRSState(yest, today);
    expect({ s: m.todayScore, d: m.todayScoreDate }).toEqual({ s: 10, d: '2026-09-05' });
  });

  it('takes the better score when both are the same day', () => {
    const a = base({ todayScore: 30, todayScoreDate: '2026-09-05' });
    const b = base({ todayScore: 80, todayScoreDate: '2026-09-05' });
    expect(mergeSRSState(a, b).todayScore).toBe(80);
  });

  it('unions forgiven days rather than picking a side', () => {
    const a = base({ forgivenDays: ['2026-09-02', '2026-09-03'] });
    const b = base({ forgivenDays: ['2026-09-03', '2026-09-04'] });
    expect(mergeSRSState(a, b).forgivenDays).toEqual(['2026-09-02', '2026-09-03', '2026-09-04']);
  });

  it('merges accuracy per day by MAX, not by sum', () => {
    const a = base({ accuracy: [{ d: '2026-09-05', right: 4, total: 5 }] });
    const b = base({ accuracy: [{ d: '2026-09-05', right: 2, total: 8 }, { d: '2026-09-04', right: 1, total: 1 }] });
    expect(mergeSRSState(a, b).accuracy).toEqual([
      { d: '2026-09-04', right: 1, total: 1 },
      { d: '2026-09-05', right: 4, total: 8 },
    ]);
  });

  it('merges each language streak on its own clock', () => {
    const a = base({ byLanguage: { zh: { streak: 20, lastActive: '2026-09-05' }, es: { streak: 3, lastActive: '2026-09-01' } } });
    const b = base({ byLanguage: { zh: { streak: 1,  lastActive: '2026-09-02' }, fr: { streak: 7, lastActive: '2026-09-05' } } });
    expect(mergeSRSState(a, b).byLanguage).toEqual({
      zh: { streak: 20, lastActive: '2026-09-05', forgivenDays: undefined },
      es: { streak: 3, lastActive: '2026-09-01' },
      fr: { streak: 7, lastActive: '2026-09-05' },
    });
  });

  it('leaves optional fields absent rather than filling in defaults', () => {
    const m = mergeSRSState(base(), base());
    expect('lastActive' in m).toBe(false);
    expect('sessions' in m).toBe(false);
    expect('accuracy' in m).toBe(false);
  });
});
