import type { DeckWord, LanguageCode, UserPrefs } from './types';

/**
 * Which proficiency levels are open to the learner, and why.
 *
 * The level tables were already a readout — "412 of 506 retained" — and a readout is not a
 * goal. This turns them into a gate: the next band's passages stay locked until you can
 * show you hold this one. The reward for progress is new reading material, which is the
 * thing the app is actually for, rather than a badge that means nothing outside it.
 *
 * There are exactly two ways through, and both are honest:
 *
 *   EARNED   — hold RETAINED_FRACTION of a level's words at RETAINED_DAYS or more of FSRS
 *              stability. This cannot be farmed: stability only rises when you remember
 *              something later than you did last time.
 *   TESTED   — pass that level's test cold, from lib/levelTest.ts. A learner arriving with
 *              five years of Spanish should not grind A1 to reach B2, and a placement test
 *              on day one is the difference between the app being usable and not.
 *
 * A level is open if EITHER holds, so the test is a shortcut and never a barrier — someone
 * who ignores it entirely still unlocks everything by studying.
 */

/** Stability (days) at which a card counts as retained rather than merely met. Matches the
 *  bar in LevelProgress, deliberately — one definition of "you know this word". */
export const RETAINED_DAYS = 7;

/** Share of a level that must be retained before the next one opens. */
export const RETAINED_FRACTION = 0.6;

export interface LevelStanding {
  level: number;
  total: number;
  retained: number;
  /** Words in the deck for this level that haven't reached RETAINED_DAYS yet. */
  started: number;
  /** retained / total, 0–1. */
  fraction: number;
  /** Whether this level's own bar is full enough to open the NEXT one. */
  meetsThreshold: boolean;
  unlocked: boolean;
  /** How this level came to be unlocked — null when it isn't. */
  via: 'first' | 'earned' | 'tested' | null;
}

/** Highest level ever unlocked by passing a test, for this language. */
export function testedThrough(prefs: Pick<UserPrefs, 'testedLevels'>, lang: LanguageCode): number {
  return prefs.testedLevels?.[lang] ?? 0;
}

/**
 * Per-level standing for a deck, in level order.
 *
 * `table` is the language's level → words map (curriculum.ts `loadLevelTable`). Levels are
 * numbered so that 1 is easiest for every language — including Japanese, where the *label*
 * counts down (N5 is level 1). Nothing here needs to know that.
 */
export function levelStandings(
  deck: DeckWord[],
  table: Record<number, string[]>,
  levels: number[],
  testedLevel: number,
): LevelStanding[] {
  // A character can hold several readings as separate cards; credit the strongest.
  const byWord = new Map<string, DeckWord>();
  for (const w of deck) {
    if (w.pool) continue;
    const k = w.h.trim().toLowerCase();
    const prev = byWord.get(k);
    if (!prev || (w.stability ?? 0) > (prev.stability ?? 0)) byWord.set(k, w);
  }

  const rows = levels.map(level => {
    const words = table[level] ?? [];
    let retained = 0, started = 0;
    for (const word of words) {
      const card = byWord.get(word.trim().toLowerCase());
      if (!card) continue;
      if ((card.stability ?? 0) >= RETAINED_DAYS) retained++;
      else started++;
    }
    const fraction = words.length ? retained / words.length : 0;
    return {
      level, total: words.length, retained, started, fraction,
      meetsThreshold: words.length > 0 && fraction >= RETAINED_FRACTION,
      unlocked: false, via: null as LevelStanding['via'],
    };
  }).filter(r => r.total > 0);

  // Walk upward: the first level is always open, and each subsequent one opens when the
  // level below it is full enough. The chain stops at the first level that isn't — you
  // cannot earn your way past a gap, only test past it.
  let earnedThrough = rows.length ? rows[0].level : 0;
  for (const r of rows) {
    if (r.level > earnedThrough) break;
    if (r.meetsThreshold) earnedThrough = r.level + 1;
  }

  // Passing a level's test opens that level and everything under it.
  const openThrough = Math.max(earnedThrough, testedLevel);
  for (const r of rows) {
    r.unlocked = r.level <= openThrough;
    r.via = !r.unlocked ? null
      : r.level === rows[0].level ? 'first'
      : r.level <= earnedThrough ? 'earned'
      : 'tested';
  }
  return rows;
}

/** The highest level the learner may currently select. */
export function highestUnlocked(rows: LevelStanding[]): number {
  return rows.reduce((m, r) => (r.unlocked ? Math.max(m, r.level) : m), rows[0]?.level ?? 1);
}

/** How many more words of `row` must be retained before the next level opens. */
export function wordsToUnlockNext(row: LevelStanding): number {
  return Math.max(0, Math.ceil(row.total * RETAINED_FRACTION) - row.retained);
}
