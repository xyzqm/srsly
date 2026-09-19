import type { EarnedFont, EarnedTheme, FreeFont, FreeTheme } from './types';

/**
 * THEMES AND TYPEFACES YOU EARN, DERIVED FROM MILESTONES THAT ALREADY EXIST.
 *
 * Nothing here is stored. A cosmetic is unlocked when its milestone is earned, and
 * `lib/achievements.ts` already computes every milestone from the deck and `srsly-srs-state`
 * on read — so this is a second READING of that data, never a second RECORD of it. There is
 * no unlocked-cosmetics table to migrate, to sync, or to drift out of agreement with the deck
 * it describes. That is CLAUDE.md's "store only what cannot be derived" applied to the
 * feature most likely to violate it, exactly as the milestone panel already does.
 *
 * ── THE ONE RULE: ADDITIONS ONLY ─────────────────────────────────────────────
 *
 * The six themes and five typefaces that shipped free stay free, for ever. `Theme` and `Font`
 * are split into `Free*` and `Earned*` in lib/types.ts so a cosmetic CANNOT name one of them
 * — the catalogue below is typed against `EarnedTheme`/`EarnedFont`, and `tests/cosmetics.
 * test.ts` asserts the two sets never intersect.
 *
 * That is not tidiness. Locking something a learner already uses is a downgrade wearing a
 * reward's clothes: they open the app one morning and their theme is gone, held hostage
 * behind a number. It also collides with the app's own position that levels are calibration
 * and a map rather than the goal — a cosmetic ladder that TAKES is the gamified treadmill
 * this codebase refuses everywhere else. A cosmetic ladder that only ever adds costs an
 * existing learner nothing and gives a new one something to find.
 *
 * ── WHY NO STREAK UNLOCKS, WHICH IS THE INTERESTING CONSTRAINT ───────────────
 *
 * The obvious unlock is a streak, and it is the one axis that cannot be used. Milestones are
 * derived from CURRENT state, so `streak-30` stops being earned the instant a day is missed —
 * and a derived gate would then confiscate the theme on the first morning someone overslept.
 * "Has this learner ever held a 30-day streak" genuinely cannot be derived and would need a
 * stored high-water mark, which is a synced field, a merge rule and a migration bought to
 * hand out a colour scheme.
 *
 * So every condition below is on a counter that only goes UP in ordinary use: `sessions` is
 * incremented and never decremented, `deckSize` and `booksFinished` fall only if the learner
 * deletes something themselves, and `mastered` moves slowly in both directions. `hooks/
 * useTheme.ts` is the backstop for the remainder: it applies whatever the prefs say without
 * consulting this file at all, so a cosmetic already in use is never revoked mid-session.
 * The gate is on CHOOSING, never on WEARING.
 *
 * ── THE PROSE IS AUTHORED; THE GATE IS A REFERENCE ───────────────────────────
 *
 * `requires` is an achievement id and is checked against `ACHIEVEMENTS` by a test, so a
 * renamed or deleted milestone is a failing build rather than a cosmetic nobody can ever
 * reach. `unlockedBy` is a written phrase rather than the milestone's own description,
 * because the generated ones read badly at the boundary: `tiered()` composes "1 review
 * sessions finished". Progress — "37 / 50" — is still read off the achievement, so the two
 * cannot disagree about how far along someone is.
 */

/** Available from the first launch, to everyone, always. Listed so a test can enforce it. */
export const FREE_THEMES: readonly FreeTheme[] = ['paper', 'ink', 'tea', 'slate', 'bone', 'dusk'];
export const FREE_FONTS: readonly FreeFont[] = [
  'editorial-warm', 'quiet-serif', 'technical', 'classic', 'sans-modern',
];

export interface Cosmetic {
  /** The `data-theme` / `data-font` value, and the id used everywhere else. */
  readonly id: EarnedTheme | EarnedFont;
  readonly kind: 'theme' | 'font';
  /** What the picker calls it. */
  readonly name: string;
  /** The milestone that opens it — an id in `ACHIEVEMENTS`, pinned by a test. */
  readonly requires: string;
  /** The condition as a learner reads it. Authored; see the note above on why. */
  readonly unlockedBy: string;
}

/**
 * Six, spread across four ladders and three distances.
 *
 * `vellum` is reachable in a first sitting on purpose — the same reasoning that put
 * `first-word` and `first-steps` at 1 and 5 words. A reward system whose cheapest rung takes
 * a month has nothing to say in the moment it most needs to prove that the rungs are real.
 */
export const COSMETICS: readonly Cosmetic[] = [
  {
    id: 'vellum', kind: 'theme', name: 'Vellum',
    requires: 'sessions-1', unlockedBy: 'Finish your first review session',
  },
  {
    id: 'grand', kind: 'font', name: 'Grand',
    requires: 'deck-50', unlockedBy: 'Collect 50 words',
  },
  {
    id: 'sakura', kind: 'theme', name: 'Sakura',
    requires: 'mastered-50', unlockedBy: 'Hold 50 words for a month',
  },
  {
    id: 'typewriter', kind: 'font', name: 'Typewriter',
    requires: 'book-1', unlockedBy: 'Finish a book, end to end',
  },
  {
    id: 'midnight', kind: 'theme', name: 'Midnight',
    requires: 'sessions-50', unlockedBy: 'Finish 50 review sessions',
  },
  {
    id: 'terminal', kind: 'theme', name: 'Terminal',
    requires: 'mastered-500', unlockedBy: 'Hold 500 words for a month',
  },
];

const BY_ID = new Map<string, Cosmetic>(COSMETICS.map(c => [c.id, c]));

/** The catalogue entry for a theme or font id, or undefined for one of the free ones. */
export function cosmeticFor(id: string): Cosmetic | undefined {
  return BY_ID.get(id);
}

/**
 * Which earned cosmetics are open, given the milestone ids the learner currently holds.
 *
 * Takes ids rather than the achievement objects so the caller can pass whatever it already
 * has — `useAchievements().earned.map(a => a.id)`, or a set read from anywhere else — and so
 * this module never has to import the milestone engine to answer a question about it.
 */
export function unlockedCosmetics(earnedIds: Iterable<string>): Set<string> {
  const earned = earnedIds instanceof Set ? earnedIds : new Set(earnedIds);
  return new Set(COSMETICS.filter(c => earned.has(c.requires)).map(c => c.id));
}

/**
 * Whether a theme or font may be CHOSEN right now.
 *
 * A free one is always true. An earned one is true once its milestone is held — or once it is
 * the one currently applied, which is the "never revoke what someone is wearing" half of the
 * rule. `current` is passed in rather than read from prefs so this stays a pure function.
 */
export function canSelect(id: string, unlocked: ReadonlySet<string>, current?: string): boolean {
  if (!BY_ID.has(id)) return true;
  return unlocked.has(id) || id === current;
}

/** How many earned cosmetics are open, for the "3 of 6 unlocked" line in the picker. */
export function unlockedCount(unlocked: ReadonlySet<string>): number {
  return COSMETICS.filter(c => unlocked.has(c.id)).length;
}
