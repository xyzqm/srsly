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
 *
 * BOTH PATHS OPEN THE LEVEL ABOVE THE ONE YOU DEMONSTRATED, and they must, because they are
 * claims about the same thing. Retention at A1 opens A2; passing A1's test therefore opens
 * A2 as well. Making the test open only the level it examined quietly broke the placement
 * run: A1 is open to everyone already, so acing the A1 block and skipping it produced
 * identical results and the first question of the whole test could not matter.
 */

/** Stability (days) at which a card counts as retained rather than merely met. Matches the
 *  bar in LevelProgress, deliberately — one definition of "you know this word". */
export const RETAINED_DAYS = 7;

/** Share of a level that must be retained before the next one opens. */
export const RETAINED_FRACTION = 0.6;

export interface LevelStanding {
  level: number;
  /** Position in the curriculum, 0 = easiest. THE ordering — see levelStandings. */
  rank: number;
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

/** Highest level whose test the learner has PASSED — which opens the level above it. */
export function testedThrough(prefs: Pick<UserPrefs, 'testedLevels'>, lang: LanguageCode): number {
  return prefs.testedLevels?.[lang] ?? 0;
}

/**
 * Per-level standing for a deck, easiest first.
 *
 * `table` is the language's level → words map (curriculum.ts `loadLevelTable`) and `levels`
 * comes from the config in curriculum order, EASIEST FIRST.
 *
 * ORDERING IS BY POSITION, NEVER BY LEVEL NUMBER. Japanese counts down — level 5 is N5, the
 * easiest, and level 1 is N1, the hardest — so arithmetic like `level + 1` or `level <=
 * openThrough` means the opposite there than it does for HSK and CEFR. That is precisely
 * how every JLPT level came to render unlocked: the walk started at `rows[0].level` = 5 and
 * `r.level <= 5` is true of all five. The config array is documented as easiest → hardest
 * for every language, so its index is the one ordering that holds everywhere.
 */
export function levelStandings(
  deck: DeckWord[],
  table: Record<number, string[]>,
  levels: number[],
  /** Levels the learner may open regardless of retention: the highest test they passed
   *  (which opens the level ABOVE it, exactly as retention does), and whatever they already
   *  had selected before unlocking existed. Compared BY RANK, not by number. */
  opened: { testedLevel?: number; selectedLevel?: number } = {},
): LevelStanding[] {
  // A character can hold several readings as separate cards; credit the strongest.
  const byWord = new Map<string, DeckWord>();
  for (const w of deck) {
    if (w.pool) continue;
    const k = w.h.trim().toLowerCase();
    const prev = byWord.get(k);
    if (!prev || (w.stability ?? 0) > (prev.stability ?? 0)) byWord.set(k, w);
  }

  const rows = levels.map((level, rank) => {
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
      level, rank, total: words.length, retained, started, fraction,
      meetsThreshold: words.length > 0 && fraction >= RETAINED_FRACTION,
      unlocked: false, via: null as LevelStanding['via'],
    };
  }).filter(r => r.total > 0);

  // Re-rank after the filter, so `rank` stays contiguous if a level had no words.
  rows.forEach((r, i) => { r.rank = i; });

  // Walk upward by POSITION: the easiest level is always open, and each next one opens when
  // the one below it is full enough. The chain stops at the first level that isn't — you
  // cannot earn your way past a gap, only test past it.
  let earnedRank = 0;
  for (const r of rows) {
    if (r.rank > earnedRank) break;
    if (r.meetsThreshold) earnedRank = r.rank + 1;
  }

  // Resolved through rank so it is right for a descending curriculum too. A passed test
  // opens the NEXT level up, mirroring retention; a level already selected opens only itself,
  // since that is grandfathering rather than an achievement.
  const rankOf = (level?: number) =>
    level === undefined ? -1 : (rows.find(r => r.level === level)?.rank ?? -1);
  const testedRank = rankOf(opened.testedLevel);
  const openRank = Math.max(
    earnedRank,
    testedRank < 0 ? -1 : testedRank + 1,
    rankOf(opened.selectedLevel),
  );

  for (const r of rows) {
    r.unlocked = r.rank <= openRank;
    r.via = !r.unlocked ? null
      : r.rank === 0 ? 'first'
      : r.rank <= earnedRank ? 'earned'
      : 'tested';
  }
  return rows;
}

/** The hardest level the learner may currently select — by rank, not by number. */
export function highestUnlocked(rows: LevelStanding[]): number | undefined {
  const open = rows.filter(r => r.unlocked);
  return open.length ? open[open.length - 1].level : rows[0]?.level;
}

/**
 * The level that gates `row` — the one immediately easier, or undefined for the first.
 *
 * This is what BOTH paths measure: retain enough of it, or pass its test, and `row` opens.
 * It is therefore also the level a challenge test must examine — testing the locked level's
 * own words would set a different bar from the one the copy beside it promises.
 */
export function gateFor(rows: LevelStanding[], row: LevelStanding): LevelStanding | undefined {
  return rows[row.rank - 1];
}

/** The level a placement result should select: one above the hardest test passed. */
export function levelAfter(levels: number[], passed: number): number | undefined {
  const i = levels.indexOf(passed);
  if (i < 0) return undefined;
  return levels[Math.min(i + 1, levels.length - 1)];
}

/** How many more words of `row` must be retained before the next level opens. */
export function wordsToUnlockNext(row: LevelStanding): number {
  return Math.max(0, Math.ceil(row.total * RETAINED_FRACTION) - row.retained);
}
