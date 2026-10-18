import type { DayActivity } from './activityLog';

/**
 * A pact: two or more people, one target, nothing to lose.
 *
 * ## IT IS A SUM TOWARD A TARGET, AND THAT IS THE WHOLE PRODUCT DECISION
 *
 * This file's neighbours already settled the argument a leaderboard would reopen. *An unlock may
 * only ever ADD* — so there is no rank, no position, no demotion and no way for one person's good
 * week to cost another anything. Falling behind renders as DISTANCE REMAINING, which is a fact
 * about the goal rather than a judgement about the person.
 *
 * *NO STREAK UNLOCKS* holds doubly. A shared streak is the obvious mechanic and is the one that
 * must not exist here: it makes a missed morning let somebody ELSE down, which is the opposite of
 * the reason this app forgives a rest day at all. Nothing in a pact reads or writes the streak.
 *
 * ## ⚠ `byMember` IS NOW SORTED BY CONTRIBUTION, WHICH REVERSES THIS FILE'S OWN RULE
 *
 * It said, in this paragraph, that sorting by contribution IS a leaderboard whatever the column
 * heading says, and that sorting by a name nobody chose for its rank made that impossible by
 * construction. A test enforced it with a member contributing ten times the rest who still
 * sorted last. That was a deliberate product position and it has been **deliberately reversed**
 * (2026-10-18, on request) rather than eroded — which is the only way this file permits such a
 * thing to change.
 *
 * **What the reversal keeps is the reason the rule existed.** The fear was a public ranking
 * somebody cannot escape. A pact is *invite-only*: you are on this list because you gave
 * somebody an eight-character code, the window ends on a date you chose, and there is no global
 * table, no rank across strangers and nothing carried between pacts. Being second of two people
 * you asked to study with is not the thing the rule was protecting anyone from.
 *
 * **And the surrounding refusals all still hold.** There is still no demotion — *an unlock may
 * only ever ADD* — still no shared streak, still nothing a bad week can take away, and the pact
 * is still **a sum toward one target** with ONE progress bar. The order of the rows changed; the
 * goal did not become a race, because finishing is defined by the total rather than by who put
 * in most.
 *
 * `rank` is computed here rather than left to the renderer, for the same reason the sort was:
 * a fact this load-bearing should be testable without rendering anything. Equal contributions
 * share a rank, because telling two people who did identical work that one of them came second
 * is the kind of detail that makes a list like this unpleasant.
 *
 * ## NOBODY CAN CHEAT AT THIS, AND IT IS NOT WORTH DEFENDING AGAINST
 *
 * A contribution is computed on the member's own device from their own activity log and
 * published. A determined learner could publish any number they liked — and the server could not
 * do better, because the log it would recompute from is itself written by that same device. The
 * honest answer is that there is nothing to win: no rank, no prize, and the other person is
 * somebody you chose. Guarding it would cost a table, a function and a round trip to protect a
 * number whose only reader already trusts you.
 */

/** What a pact counts. Each maps to a record this app already keeps for another reason. */
export type PactGoal = 'cards' | 'passages' | 'days';

export interface PactMemberView {
  userId: string;
  label: string;
  contributed: number;
}

/** A member, with the standing the panel shows beside them. */
export interface PactMemberStanding extends PactMemberView {
  /** 1-based. Equal contributions SHARE a rank, and the next rank skips accordingly. */
  rank: number;
}

export interface Pact {
  id: string;
  code: string;
  goal: PactGoal;
  target: number;
  /** `YYYY-MM-DD`, inclusive at both ends. */
  starts: string;
  ends: string;
}

/**
 * The join code's alphabet: 32 symbols with every look-alike pair removed.
 *
 * `O`/`0`, `I`/`1`/`l` and `U`/`V` are gone, because this is a string somebody reads off one
 * screen and types into another — and a code that fails on a misread `0` is indistinguishable
 * from a code that is simply wrong, which is the worst failure a join flow can have.
 *
 * 8 characters over 32 symbols is 40 bits. That is the ONLY thing standing between a pact and a
 * script, because `join_pact` has to be callable by somebody who cannot yet see the row — so it
 * is an oracle by construction. The per-caller daily attempt cap in the SQL is the other half;
 * neither is sufficient alone.
 */
export const PACT_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTWXYZ';   // 30 symbols
export const PACT_CODE_LENGTH = 8;

/**
 * 30 symbols, not the round 32, and the shortfall is deliberate.
 *
 * Reaching 32 would mean adding punctuation — which people mistype and shells mangle — or
 * restoring a look-alike, and neither is worth 0.4 of a bit: 30^8 is **39.3 bits** against
 * 32^8's 40.0. Stated as 39 rather than rounded up to "about 40", because a security number
 * rounded in the comfortable direction is the kind this codebase refuses everywhere else.
 *
 * ONE alphabet, exported, and the generator and the validator both read it. Two copies of this
 * string is how a code that generates cleanly stops validating.
 */
export const PACT_CODE_BITS = Math.log2(PACT_ALPHABET.length ** PACT_CODE_LENGTH);

/** Generate a code. `random` is injected so the generator is testable and never a global. */
export function generatePactCode(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < PACT_CODE_LENGTH; i++) {
    out += PACT_ALPHABET[Math.floor(random() * PACT_ALPHABET.length) % PACT_ALPHABET.length];
  }
  return out;
}

/**
 * Is this something a learner could have typed as a code?
 *
 * Uppercased first, because somebody typing it back in will not hold shift, and rejecting
 * `a7bc…` for its case would be a failure the reader cannot see. Whitespace and dashes are
 * stripped for the same reason — people insert them when reading aloud.
 */
export function normalisePactCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

export function isPactCode(raw: string): boolean {
  const s = normalisePactCode(raw);
  return s.length === PACT_CODE_LENGTH && [...s].every(c => PACT_ALPHABET.includes(c));
}

/**
 * What this device has contributed to a pact, RECOMPUTED WHOLE.
 *
 * Never an increment. `set`, always, from the records that already exist — which is what makes
 * publishing idempotent, and therefore replay-safe, double-write-safe and safe to skip entirely
 * when offline. That is the identical argument `mergeActivity` makes for taking a per-day MAX:
 * a device writes its own merged copy back, so any operation that ACCUMULATES double-counts on
 * the next round trip.
 *
 * It is also what keeps "store only what cannot be derived" intact in a feature whose entire
 * point is showing somebody a number they are unable to derive. The RECORD is still the activity
 * log and the shelf; the pact row is a refreshed cache of a derivation, published so that one
 * other person can see it.
 */
export function contributionFor(
  pact: Pick<Pact, 'goal' | 'starts' | 'ends'>,
  source: { log: DayActivity[]; passageDates: string[] },
): number {
  const inWindow = (d: string) => d >= pact.starts && d <= pact.ends;
  switch (pact.goal) {
    case 'cards':
      return source.log.filter(e => inWindow(e.d)).reduce((n, e) => n + Math.max(0, e.n), 0);
    case 'days':
      return source.log.filter(e => inWindow(e.d) && e.n > 0).length;
    case 'passages':
      return source.passageDates.filter(inWindow).length;
  }
}

export interface PactProgress {
  total: number;
  target: number;
  /** Never negative: a pact that is finished is finished, not overachieved by a margin. */
  remaining: number;
  /** 0–1, clamped. */
  fraction: number;
  done: boolean;
  /**
   * Sorted by CONTRIBUTION, descending, with ties broken by label so the order is stable.
   * See the note at the top of this file — this reverses a rule that was previously enforced
   * here, and the reasoning for the reversal is recorded there rather than in a commit nobody
   * will read.
   */
  byMember: PactMemberStanding[];
}

/**
 * Number an already-sorted list, sharing a rank between equal contributions.
 *
 * Standard competition ranking: two people tied at the top are both 1st and the next is 3rd.
 * The alternative — breaking the tie on a name — tells somebody they came second for having a
 * later initial, which is exactly the kind of detail that makes a list like this unpleasant.
 */
function rank(sorted: PactMemberView[]): PactMemberStanding[] {
  let last = Number.NaN;
  let at = 0;
  return sorted.map((m, i) => {
    if (m.contributed !== last) { at = i + 1; last = m.contributed; }
    return { ...m, rank: at };
  });
}

export function pactProgress(pact: Pick<Pact, 'target'>, members: PactMemberView[]): PactProgress {
  const total = members.reduce((n, m) => n + Math.max(0, m.contributed), 0);
  const target = Math.max(1, pact.target);
  return {
    total,
    target,
    remaining: Math.max(0, target - total),
    fraction: Math.min(1, total / target),
    done: total >= target,
    byMember: rank([...members].sort((a, b) =>
      // Contribution first; then label, then id, so two members who have done exactly the same
      // amount still come out in a STABLE order rather than whichever the array happened to
      // hold — a list that reshuffles on every poll reads as broken.
      b.contributed - a.contributed
      || a.label.localeCompare(b.label)
      || a.userId.localeCompare(b.userId))),
  };
}

/** Whole days left, inclusive of today. Zero once the end date has passed. */
export function daysLeft(pact: Pick<Pact, 'ends'>, today: string): number {
  if (today > pact.ends) return 0;
  const [ty, tm, td] = today.split('-').map(Number);
  const [ey, em, ed] = pact.ends.split('-').map(Number);
  const ms = Date.UTC(ey, em - 1, ed) - Date.UTC(ty, tm - 1, td);
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}
