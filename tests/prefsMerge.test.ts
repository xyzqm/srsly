import { describe, it, expect } from 'vitest';
import { mergePrefs } from '@/lib/prefsMerge';
import type { UserPrefs } from '@/lib/types';

/**
 * `prefs` once two devices share it.
 *
 * It was one blob, last-writer-wins, so changing the THEME on a phone also wrote the phone's
 * idea of the level, the retention target, the blank density and the language list. Any
 * device holding a stale copy silently reverted every setting the other one had changed.
 *
 * The whole fix is the BASE: knowing what this device changed, rather than only what it
 * holds. Most of these are that distinction.
 */

const p = (o: Partial<UserPrefs> = {}): UserPrefs => ({ theme: 'paper', font: 'editorial-warm', ...o });

describe('a device only writes what it actually changed', () => {
  /** THE BUG. The phone changes the theme; the laptop's level must survive. */
  it('does not revert another device’s change to a field it did not touch', () => {
    const base   = p({ theme: 'paper', hskLevel: 3 });
    const mine   = p({ theme: 'ink',   hskLevel: 3 });   // phone: theme only
    const theirs = p({ theme: 'paper', hskLevel: 5 });   // laptop: level only
    expect(mergePrefs(base, mine, theirs)).toMatchObject({ theme: 'ink', hskLevel: 5 });
  });

  it('keeps every untouched field from the cloud', () => {
    const base   = p({ srsRetention: 0.9, blankDensity: 12, poolActivateCount: 10 });
    const mine   = p({ srsRetention: 0.9, blankDensity: 12, poolActivateCount: 10 });
    const theirs = p({ srsRetention: 0.8, blankDensity: 20, poolActivateCount: 4 });
    expect(mergePrefs(base, mine, theirs)).toMatchObject(
      { srsRetention: 0.8, blankDensity: 20, poolActivateCount: 4 });
  });

  it('lets this device win the field it did change, even against a newer cloud value', () => {
    const base   = p({ font: 'editorial-warm' });
    const mine   = p({ font: 'technical' });
    const theirs = p({ font: 'quiet-serif' });
    expect(mergePrefs(base, mine, theirs).font).toBe('technical');
  });

  it('treats clearing a field as a change, not as an absence', () => {
    const base   = p({ blankDensity: 12 });
    const mine   = p({});                    // cleared here
    const theirs = p({ blankDensity: 12 });
    expect('blankDensity' in mergePrefs(base, mine, theirs)).toBe(false);
  });

  /** Key order differs after a JSONB round trip; a raw stringify would call this a change. */
  it('does not mistake a reordered object for an edit', () => {
    const base   = p({ testedLevels: { zh: 3, es: 2 } as never, theme: 'paper' });
    const mine   = p({ testedLevels: { es: 2, zh: 3 } as never, theme: 'paper' });
    const theirs = p({ testedLevels: { zh: 3, es: 2 } as never, theme: 'ink' });
    expect(mergePrefs(base, mine, theirs).theme).toBe('ink');
  });
});

describe('with no base, the local copy is the floor', () => {
  /** A first sync cannot tell a change from a stale value. Losing the learner's just-made
   *  change is the worse of the two errors, so `mine` wins the scalars — the old behaviour. */
  it('takes mine for scalars when there is nothing to diff against', () => {
    const mine   = p({ theme: 'ink', hskLevel: 3 });
    const theirs = p({ theme: 'paper', hskLevel: 5 });
    expect(mergePrefs(null, mine, theirs)).toMatchObject({ theme: 'ink', hskLevel: 3 });
  });

  it('still merges the keyed collections', () => {
    const mine   = p({ testedLevels: { zh: 4 } });
    const theirs = p({ testedLevels: { es: 2 } });
    expect(mergePrefs(null, mine, theirs).testedLevels).toEqual({ zh: 4, es: 2 });
  });

  it('returns mine untouched when the cloud has nothing', () => {
    const mine = p({ theme: 'ink' });
    expect(mergePrefs(null, mine, null)).toEqual(mine);
  });
});

describe('the keyed collections merge per key, never by replacement', () => {
  it('keeps both languages’ poolAutoDate, taking the later date', () => {
    const mine   = p({ poolAutoDate: { zh: '2026-09-05', es: '2026-09-01' } });
    const theirs = p({ poolAutoDate: { zh: '2026-09-03', fr: '2026-09-04' } });
    expect(mergePrefs(p(), mine, theirs).poolAutoDate).toEqual(
      { zh: '2026-09-05', es: '2026-09-01', fr: '2026-09-04' });
  });

  it('never re-locks a tested level', () => {
    const mine   = p({ testedLevels: { zh: 5 } });
    const theirs = p({ testedLevels: { zh: 2, es: 3 } });
    expect(mergePrefs(p(), mine, theirs).testedLevels).toEqual({ zh: 5, es: 3 });
  });

  it('keeps a placement test seen once seen anywhere', () => {
    const mine   = p({ placementSeen: { zh: true } });
    const theirs = p({ placementSeen: { zh: false, fr: true } });
    expect(mergePrefs(p(), mine, theirs).placementSeen).toEqual({ zh: true, fr: true });
  });

  it('unions the language list rather than replacing it', () => {
    const mine   = p({ languages: ['zh', 'fr'] });
    const theirs = p({ languages: ['zh', 'es'] });
    expect(mergePrefs(p(), mine, theirs).languages).toEqual(['zh', 'es', 'fr']);
  });
});

describe('the result is safe to write back and merge again', () => {
  it('is idempotent once the merged value is the cloud value', () => {
    const base   = p({ theme: 'paper', hskLevel: 3, testedLevels: { zh: 2 } });
    const mine   = p({ theme: 'ink', hskLevel: 3, testedLevels: { zh: 4 } });
    const theirs = p({ theme: 'paper', hskLevel: 5, testedLevels: { es: 1 } });
    const once = mergePrefs(base, mine, theirs);
    // The device now holds `once` and has seen `once` in the cloud: nothing more to apply.
    expect(mergePrefs(once, once, once)).toEqual(once);
  });
});
