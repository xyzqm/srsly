import type {
  EarnedBlankStyle, EarnedFont, EarnedTexture, EarnedTheme,
  FreeBlankStyle, FreeFont, FreeTexture, FreeTheme,
} from './types';

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
/** One each, because one each is what shipped. Both stay free for the same reason as above. */
export const FREE_TEXTURES: readonly FreeTexture[] = ['grain'];
export const FREE_BLANKS: readonly FreeBlankStyle[] = ['dotted'];

/**
 * `palette` is the odd one out: it unlocks a CONTROL rather than a value.
 *
 * Everything else here names something to switch to. The custom accent unlocks the colour
 * picker itself, so its id is not a `data-` value and nothing renders it as a swatch — which
 * is exactly why it is worth the top of the ladder rather than being a seventh theme.
 */
export type CosmeticKind = 'theme' | 'font' | 'texture' | 'blank' | 'palette';

export interface Cosmetic {
  /** The `data-*` value this selects, and the id used everywhere else. */
  readonly id: EarnedTheme | EarnedFont | EarnedTexture | EarnedBlankStyle | 'custom-accent';
  readonly kind: CosmeticKind;
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

  // ── Paper ──────────────────────────────────────────────────────────────────
  // The grain layer under everything. Cheap to add, impossible to miss, and unlike a palette
  // it is specific to an app whose whole identity is paper.
  {
    id: 'laid', kind: 'texture', name: 'Laid paper',
    requires: 'deck-25', unlockedBy: 'Collect 25 words',
  },
  {
    id: 'grid', kind: 'texture', name: 'Grid',
    requires: 'sessions-10', unlockedBy: 'Finish 10 review sessions',
  },
  {
    id: 'smooth', kind: 'texture', name: 'Smooth',
    requires: 'mastered-100', unlockedBy: 'Hold 100 words for a month',
  },

  // ── Blanks ─────────────────────────────────────────────────────────────────
  // The thing a learner looks at most: a passage is prose you read once and gaps you stare at.
  {
    id: 'solid', kind: 'blank', name: 'Solid rule',
    requires: 'deck-250', unlockedBy: 'Collect 250 words',
  },
  /**
   * WAS `leech-10`, AND THAT WAS UNREACHABLE BY DESIGN RATHER THAN BY DIFFICULTY.
   *
   * "Rescue 10 stuck words" requires first HAVING ten stuck words — ten cards each failed
   * enough times to trip `LEECH_THRESHOLD`. A learner who studies well may never produce one,
   * so the cosmetic was not hard for them, it was impossible, and nothing on screen would ever
   * have explained why. Worse, it is the only condition here that rewards going BADLY: the
   * one way to guarantee it is to forget a lot of words.
   *
   * The rule this adds to the streak rule above: **a condition must be something a learner can
   * aim at.** A counter that only moves when things go wrong fails that even though it rises
   * monotonically, which is why the no-streak test could not catch it.
   */
  {
    id: 'box', kind: 'blank', name: 'Boxed',
    requires: 'deck-1000', unlockedBy: 'Collect 1,000 words',
  },
  {
    id: 'shaded', kind: 'blank', name: 'Shaded',
    requires: 'books-3', unlockedBy: 'Finish 3 books',
  },

  // ── The summit ─────────────────────────────────────────────────────────────
  /**
   * THE HARDEST THING IN THE APP, and deliberately not the biggest NUMBER in it. `deck-1000`
   * is a thousand words collected, which is an afternoon of importing; `mastered-1000` is a
   * thousand words each holding a month of stability, which cannot be rushed and cannot be
   * faked, because FSRS is the one measure here that only time can move.
   */
  {
    id: 'custom-accent', kind: 'palette', name: 'Custom colour',
    requires: 'mastered-1000', unlockedBy: 'Hold 1,000 words for a month',
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

/** How many earned cosmetics are open, for the "3 of 13 unlocked" line in the picker. */
export function unlockedCount(unlocked: ReadonlySet<string>): number {
  return COSMETICS.filter(c => unlocked.has(c.id)).length;
}

/** The catalogue for one kind, in ladder order. */
export function cosmeticsOfKind(kind: CosmeticKind): Cosmetic[] {
  return COSMETICS.filter(c => c.kind === kind);
}

/** Whether the custom-colour control is available. Its own helper because it gates a CONTROL
 *  rather than a value, so no swatch list can answer it. */
export const CUSTOM_ACCENT_ID = 'custom-accent';
export function canCustomiseAccent(unlocked: ReadonlySet<string>): boolean {
  return unlocked.has(CUSTOM_ACCENT_ID);
}

/**
 * A `#rrggbb` string, or null.
 *
 * Validated rather than trusted because it is written straight into an inline style: prefs
 * sync, and a value arriving from another device — or from a hand-edited localStorage blob —
 * would otherwise be injected into `style` unchecked. Three- and six-digit hex only, no
 * `rgb()`, no `var()`, no colour names; anything else is treated as "no custom colour" and
 * the theme's own accent stands.
 */
export function safeAccent(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : null;
}
