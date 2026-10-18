import { describe, it, expect } from 'vitest';
import {
  PACT_ALPHABET, PACT_CODE_LENGTH, PACT_CODE_BITS,
  generatePactCode, normalisePactCode, isPactCode,
  contributionFor, pactProgress, daysLeft,
  type PactMemberView,
} from '@/lib/pact';
import { classifyPactError } from '@/lib/pactStore';

const day = (d: string, n: number) => ({ d, n });

describe('the join code', () => {
  /**
   * `join_pact` must be callable by somebody who cannot yet SEE the pact — the select policy
   * requires membership and they have none — so it is a guessing oracle by construction. The
   * code's entropy is one half of what stands in front of it; the per-caller daily attempt cap
   * in the SQL is the other, and neither is sufficient alone.
   */
  it('carries about 39 bits', () => {
    expect(PACT_CODE_BITS).toBeGreaterThan(39);
    expect(PACT_CODE_BITS).toBeLessThan(40);   // the control: it is NOT the round 40 it looks like
  });

  /**
   * Somebody reads this off one screen and types it into another, and a code that fails on a
   * misread `0` is indistinguishable from a code that is simply wrong.
   */
  it.each([...'O0Il1UV'])('excludes the look-alike %s', c => {
    expect(PACT_ALPHABET).not.toContain(c);
  });

  it('generates codes that validate, deterministically from its own random source', () => {
    let i = 0;
    const seq = () => ((i = (i * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 200; n++) {
      const code = generatePactCode(seq);
      expect(code).toHaveLength(PACT_CODE_LENGTH);
      expect(isPactCode(code), code).toBe(true);
    }
  });

  it('forgives the shift key, spaces and dashes', () => {
    const code = generatePactCode(() => 0.5);
    expect(isPactCode(code.toLowerCase())).toBe(true);
    expect(normalisePactCode(` ${code.slice(0, 4)}-${code.slice(4)} `)).toBe(code);
    expect(isPactCode(`${code.slice(0, 4)}-${code.slice(4)}`)).toBe(true);
  });

  it('rejects the wrong length and a disallowed character', () => {
    expect(isPactCode('ABC')).toBe(false);
    expect(isPactCode('ABCDEFGHI')).toBe(false);
    expect(isPactCode('ABCDEFG0')).toBe(false);   // 0 is not in the alphabet
    expect(isPactCode('')).toBe(false);
  });
});

describe('a contribution is RECOMPUTED, never accumulated', () => {
  const log = [day('2026-09-01', 10), day('2026-09-15', 5), day('2026-09-30', 7), day('2026-10-02', 99)];
  const pact = { goal: 'cards' as const, starts: '2026-09-01', ends: '2026-09-30' };

  it('sums the cards inside the window and nothing outside it', () => {
    expect(contributionFor(pact, { log, passageDates: [] })).toBe(22);
  });

  it('includes both end dates — the boundary is inclusive', () => {
    expect(contributionFor({ ...pact, starts: '2026-09-15', ends: '2026-09-15' }, { log, passageDates: [] })).toBe(5);
  });

  it('counts DAYS rather than cards when that is the goal', () => {
    expect(contributionFor({ ...pact, goal: 'days' }, { log, passageDates: [] })).toBe(3);
  });

  it('counts passages from their dates', () => {
    const dates = ['2026-09-02', '2026-09-03', '2026-12-01'];
    expect(contributionFor({ ...pact, goal: 'passages' }, { log, passageDates: dates })).toBe(2);
  });

  /**
   * THE PROPERTY THE WHOLE SYNC DESIGN RESTS ON. The value is written with `set`, never an
   * increment, so publishing twice — a retry, a second device, a replayed offline write — lands
   * the same number. That is the identical argument `mergeActivity` makes for per-day MAX: a
   * device writes its own merged copy back, so anything that ACCUMULATES double-counts on the
   * next round trip.
   */
  it('gives the same answer however many times it is asked', () => {
    const a = contributionFor(pact, { log, passageDates: [] });
    const b = contributionFor(pact, { log, passageDates: [] });
    expect(a).toBe(b);
    expect(a + b).not.toBe(contributionFor(pact, { log, passageDates: [] }) * 2 + 1);
  });

  it('ignores a negative count rather than subtracting it', () => {
    expect(contributionFor(pact, { log: [day('2026-09-02', -50), day('2026-09-03', 4)], passageDates: [] })).toBe(4);
  });
});

describe('progress is a sum toward a target, and never a ranking', () => {
  const members: PactMemberView[] = [
    { userId: 'u3', label: 'Zoë',  contributed: 900 },
    { userId: 'u1', label: 'Ana',  contributed: 10 },
    { userId: 'u2', label: 'Mika', contributed: 90 },
  ];

  /**
   * ⚠ THIS ASSERTION IS THE REVERSE OF WHAT IT USED TO BE, AND THAT IS DELIBERATE.
   *
   * It read "sorts members by label, not by what they contributed", and called that the
   * anti-leaderboard invariant: `Zoë` contributes ten times what `Ana` does and still sorted
   * last. The product decision was reversed on request (2026-10-18) — a pact is invite-only
   * and time-boxed, so ranking the two or three people you asked to study with is not the
   * public ladder the rule was guarding against. `lib/pact.ts` carries the full reasoning.
   *
   * What is still asserted below, and matters more: ONE total toward ONE target, no demotion,
   * and no shared streak. The order of the rows changed; the goal did not become a race.
   */
  it('sorts members by what they contributed, highest first', () => {
    expect(pactProgress({ target: 1000 }, members).byMember.map(m => m.label))
      .toEqual(['Zoë', 'Mika', 'Ana']);
  });

  it('numbers them, sharing a rank between equal contributions', () => {
    // Standard competition ranking. Breaking a tie on a name tells somebody they came second
    // for having a later initial, which is the kind of detail that makes a list unpleasant.
    const tied: PactMemberView[] = [
      { userId: 'b', label: 'Bo', contributed: 40 },
      { userId: 'a', label: 'Al', contributed: 40 },
      { userId: 'c', label: 'Cy', contributed: 5 },
    ];
    expect(pactProgress({ target: 100 }, tied).byMember.map(m => [m.label, m.rank]))
      .toEqual([['Al', 1], ['Bo', 1], ['Cy', 3]]);
  });

  it('orders equal contributions stably rather than by array order', () => {
    // A list that reshuffles on every poll reads as broken.
    const a: PactMemberView[] = [
      { userId: 'z', label: 'Zed', contributed: 10 },
      { userId: 'a', label: 'Ann', contributed: 10 },
    ];
    const once = pactProgress({ target: 100 }, a).byMember.map(m => m.label);
    const again = pactProgress({ target: 100 }, [...a].reverse()).byMember.map(m => m.label);
    expect(once).toEqual(again);
  });

  it('adds everyone up', () => {
    const p = pactProgress({ target: 1000 }, members);
    expect(p.total).toBe(1000);
    expect(p.done).toBe(true);
    expect(p.remaining).toBe(0);
  });

  /** Falling behind is DISTANCE REMAINING — a fact about the goal, never about the person. */
  it('reports what is left, and never a negative or an overshoot', () => {
    expect(pactProgress({ target: 4000 }, members).remaining).toBe(3000);
    const over = pactProgress({ target: 100 }, members);
    expect(over.remaining).toBe(0);
    expect(over.fraction).toBe(1);
  });

  it('survives an empty pact and a nonsense target', () => {
    expect(pactProgress({ target: 0 }, []).fraction).toBe(0);
    expect(pactProgress({ target: 0 }, []).remaining).toBe(1);
  });
});

describe('time left', () => {
  it('counts today as a day you still have', () => {
    expect(daysLeft({ ends: '2026-09-30' }, '2026-09-30')).toBe(1);
    expect(daysLeft({ ends: '2026-09-30' }, '2026-09-28')).toBe(3);
  });

  it('is zero once it is over', () => {
    expect(daysLeft({ ends: '2026-09-30' }, '2026-10-01')).toBe(0);
  });
});

describe('a failure says which of five things went wrong', () => {
  /**
   * `unavailable` is the one worth separating, and it is the state EVERY deployment is in
   * between this code shipping and migration 0009 being run — which nothing in the repository
   * can detect. Rendering "try again in a moment" then would be advice that can never work,
   * which is the failure `GenerationError` exists to stop this codebase repeating.
   */
  it.each([
    ['Could not find the table \'public.pacts\' in the schema cache', 'unavailable'],
    ['relation "public.pact_members" does not exist',                'unavailable'],
    ['pact: sign in with an account first',                          'signed-out'],
    ['pact: too many join attempts today',                           'rate-limited'],
    ['pact: no pact with that code',                                 'not-found'],
    ['connection reset by peer',                                     'failed'],
  ])('reads %j as %s', (message, expected) => {
    expect(classifyPactError(message as string)).toBe(expected);
  });
});
