import type { DeckWord, SRSState, LanguageCode } from './types';
import { isActive } from './deck';

/**
 * Milestones to aim at, beyond today.
 *
 * The streak already answers "did you show up"; it says nothing about whether the last two
 * months went anywhere. These are the longer arc — and the reason a learner comes back on a
 * day the streak is already safe.
 *
 * **NOTHING HERE IS STORED.** Every milestone is a function of data the app already persists:
 * the deck (`srsly-vocab-deck-{lang}`) and the SRS state (`srsly-srs-state`). "50 words
 * mastered" is a count over the deck, not a counter to keep in sync — so there is no new
 * write path, nothing to migrate, and nothing that can drift out of agreement with the deck
 * it describes. That is the `lib/proverb.ts` pattern and CLAUDE.md's "store only what cannot
 * be derived" rule, applied to the feature most likely to violate it.
 *
 * The one exception is which milestones have been ANNOUNCED, which genuinely cannot be
 * derived — see `srsly-achievements-seen` in lib/achievementsSeen.ts.
 */

/** What a milestone is measured against. Derived once, then every rule reads from it. */
export interface AchievementStats {
  /** Cards that have graduated and are holding — see MASTERY_STABILITY_DAYS. */
  mastered: number;
  /** Every word in the deck, including new and paused. */
  deckSize: number;
  /** Global streak, in days. */
  streak: number;
  /** Longest per-language streak — a Chinese streak is not kept alive by a week of Spanish. */
  bestLanguageStreak: number;
  /** How many languages have a deck with anything in it. */
  languagesStudied: number;
  /** Graded review sessions completed, all time. */
  sessions: number;
  /** Books read to the end. */
  booksFinished: number;
  /** Cards that were leeches and are no longer — the triage actually worked. */
  leechesFixed: number;
}

/**
 * A card counts as mastered once it has graduated AND would survive a month.
 *
 * Review count alone is the wrong test: eight passes on a card you keep forgetting is not
 * mastery, and FSRS already has the honest measure. Stability is "days until recall falls to
 * ~90%", so 30 days means a month from now you would still know it.
 */
export const MASTERY_STABILITY_DAYS = 30;

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** How far along, for the not-yet-earned. `{ have, need }` renders as "7/30". */
  progress: (s: AchievementStats) => { have: number; need: number };
}

/**
 * Tiers rather than separate badges wherever a milestone is really one thing at four sizes.
 * Four rows that all say "words mastered" is a list to scroll; one row that levels up is a
 * thing to chase.
 */
function tiered(
  idBase: string,
  name: string,
  unit: string,
  thresholds: number[],
  get: (s: AchievementStats) => number,
): Achievement[] {
  return thresholds.map(need => ({
    id: `${idBase}-${need}`,
    name: `${name} ${need}`,
    description: `${need} ${unit}`,
    progress: (s: AchievementStats) => ({ have: get(s), need }),
  }));
}

export const ACHIEVEMENTS: Achievement[] = [
  /**
   * The first two exist for the first SESSION, and the thresholds are low on purpose.
   *
   * Every other milestone here was unreachable on day one — the smallest were 50 words in the
   * deck, 10 review sessions, or 10 words held for a month, which takes a month. So the moment
   * the app is most trying to prove itself, it had nothing to say. Tapping a word and saving it
   * IS the core loop; earning something for doing it five times is the cheapest possible proof
   * that the loop leads somewhere.
   */
  {
    id: 'first-word',
    name: 'First word',
    description: 'Save a word from something you read',
    progress: s => ({ have: s.deckSize, need: 1 }),
  },
  {
    id: 'first-steps',
    name: 'First steps',
    description: '5 words collected — they are scheduled for review now',
    progress: s => ({ have: s.deckSize, need: 5 }),
  },
  ...tiered('mastered', 'Vocabulary', 'words mastered — graduated and holding for a month',
    [10, 50, 100, 500, 1000], s => s.mastered),
  ...tiered('streak', 'Streak', 'days in a row', [2, 3, 7, 30, 100, 365], s => s.streak),
  ...tiered('sessions', 'Sessions', 'review sessions finished', [1, 10, 50, 250], s => s.sessions),
  ...tiered('deck', 'Collector', 'words in your deck', [25, 50, 250, 1000], s => s.deckSize),
  {
    id: 'book-1',
    name: 'Read a book',
    description: 'Finish an EPUB, end to end',
    progress: s => ({ have: s.booksFinished, need: 1 }),
  },
  ...tiered('books', 'Reader', 'books finished', [3, 10], s => s.booksFinished),
  {
    id: 'polyglot-2',
    name: 'Two languages',
    description: 'Study two languages at once',
    progress: s => ({ have: s.languagesStudied, need: 2 }),
  },
  {
    id: 'lang-streak-30',
    name: 'Devoted',
    description: '30 days in a row in a single language',
    progress: s => ({ have: s.bestLanguageStreak, need: 30 }),
  },
  ...tiered('leech', 'Unstuck', 'stuck words rescued', [1, 10], s => s.leechesFixed),
];

/** Mastery: graduated out of learning, and stable enough to last a month. */
export function isMastered(w: DeckWord): boolean {
  return (w.stability ?? 0) >= MASTERY_STABILITY_DAYS && (w.reviews ?? 0) > 0;
}

/**
 * A card that HAD been flagged a leech and is now healthy again.
 *
 * `leech` is cleared by LeechTriage when the learner fixes the card, so the flag being gone
 * is not evidence on its own — a card that was never stuck also has no flag. Lapses at or
 * above the threshold with the flag cleared is the combination that means "this was stuck and
 * is not any more".
 */
export function isRescuedLeech(w: DeckWord, leechThreshold: number): boolean {
  return !w.leech && (w.lapses ?? 0) >= leechThreshold && !w.paused;
}

export function computeStats(input: {
  decks: Partial<Record<LanguageCode, DeckWord[]>>;
  srs: SRSState;
  booksFinished?: number;
  leechThreshold: number;
}): AchievementStats {
  const all = Object.values(input.decks).flat().filter(Boolean) as DeckWord[];
  const langStreaks = Object.values(input.srs.byLanguage ?? {})
    .map(v => (v as { streak?: number } | undefined)?.streak ?? 0);

  return {
    mastered: all.filter(isMastered).length,
    deckSize: all.length,
    streak: input.srs.streak ?? 0,
    bestLanguageStreak: langStreaks.length ? Math.max(...langStreaks) : 0,
    languagesStudied: Object.values(input.decks).filter(d => (d?.length ?? 0) > 0).length,
    sessions: input.srs.sessions ?? 0,
    booksFinished: input.booksFinished ?? 0,
    leechesFixed: all.filter(w => isRescuedLeech(w, input.leechThreshold) && isActive(w)).length,
  };
}

export interface EarnedAchievement extends Achievement {
  earned: boolean;
  have: number;
  need: number;
}

/**
 * Every milestone, split into earned and not, with the not-yet ordered by how close it is.
 *
 * Returning what is CLOSE is most of the point. A list of what you have already done is a
 * trophy cabinet; "3 more words to 50" is the thing that gets someone to open the app.
 */
export function evaluate(stats: AchievementStats): {
  earned: EarnedAchievement[];
  next: EarnedAchievement[];
} {
  const all: EarnedAchievement[] = ACHIEVEMENTS.map(a => {
    const { have, need } = a.progress(stats);
    return { ...a, have, need, earned: have >= need };
  });
  return {
    earned: all.filter(a => a.earned),
    // Closest first, by fraction complete — "9/10" should outrank "400/500".
    next: all.filter(a => !a.earned).sort((x, y) => y.have / y.need - x.have / x.need),
  };
}
