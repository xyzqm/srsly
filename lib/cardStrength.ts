import type { DeckWord } from './types';
import { MASTERY_STABILITY_DAYS } from './achievements';

/**
 * HOW WELL A CARD IS HELD, in four coarse stages — for the deck list.
 *
 * ## THE PROBLEM IT EXISTS FOR
 *
 * The Vocab tab rendered twenty rows of word, gloss, due-label and two buttons. A card's SRS
 * STATE — the entire point of the app — was visible only when it was EXCEPTIONAL: `pool`,
 * `stuck`, `paused` and `snoozed` each earn a chip, and everything else looked identical.
 * So a word held for a year and a word saved ten minutes ago were the same row, and the deck
 * read as a spreadsheet of strings rather than as a picture of what you know.
 *
 * The information was already there — `stability` and `reviews` are on every card because
 * FSRS needs them. Nothing is stored for this; it is a function of the card.
 *
 * ## THE TOP RUNG IS `isMastered`'s THRESHOLD, DELIBERATELY SHARED
 *
 * `MASTERY_STABILITY_DAYS` is what the milestone cabinet counts, and a second number here
 * would mean the deck list and the badges disagreeing about which words are held — the "second
 * record of a fact drifts the moment either is written alone" rule, in the one place a learner
 * could see both at once. `mature` and `mastered` are the same claim.
 *
 * ## `new` DRAWS NOTHING, AND THAT IS NOT A ROUNDING CHOICE
 *
 * A card you have never been asked about has no strength to report. Drawing one segment for it
 * would say it has some — and a deck freshly imported from a level would then render as a wall
 * of partly-filled bars suggesting progress that has not happened. Zero is the honest figure
 * and it still reads as a row, because the empty track is drawn.
 */

export type CardStage = 'new' | 'learning' | 'young' | 'mature';

/** Filled segments per stage, out of `STAGE_SEGMENTS`. */
export const STAGE_SEGMENTS = 3;

/**
 * A week is the first rung because it is the first interval that means anything: FSRS's
 * learning steps are minutes and days, so a card under 7 days of stability has not yet
 * survived a gap long enough to distinguish knowing from having just seen it.
 */
export const YOUNG_STABILITY_DAYS = 7;

export function cardStage(w: DeckWord): CardStage {
  // Reviews, not stability, decides NEW. A card can carry a seeded stability and no history,
  // and calling that "learning" would claim a review that never happened.
  if (!(w.reviews ?? 0)) return 'new';
  const s = w.stability ?? 0;
  if (s >= MASTERY_STABILITY_DAYS) return 'mature';
  if (s >= YOUNG_STABILITY_DAYS) return 'young';
  return 'learning';
}

export function stageFill(stage: CardStage): number {
  return stage === 'mature' ? 3 : stage === 'young' ? 2 : stage === 'learning' ? 1 : 0;
}

/**
 * What the row says when you hover the bar.
 *
 * Plain words rather than the stage name: "young" and "mature" are Anki's vocabulary, precise
 * to somebody who already knows the system and meaningless to everybody else — the same
 * judgement that renamed the SRS tab to Review.
 */
export function stageLabel(stage: CardStage): string {
  return stage === 'mature' ? 'Held — you would still know this in a month'
    : stage === 'young' ? 'Holding — survives a week or more'
    : stage === 'learning' ? 'Still settling — comes back soon'
    : 'Not reviewed yet';
}
