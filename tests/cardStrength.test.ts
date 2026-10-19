/**
 * The deck row's stage indicator. Derived, so the tests are about the derivation.
 *
 * The one that matters is the LAST: `mature` and `isMastered` must be the same claim, because
 * a learner can see the deck list and the milestone cabinet in the same session and two
 * thresholds would have them disagreeing about which words are held.
 */
import { describe, it, expect } from 'vitest';
import { cardStage, stageFill, stageLabel, YOUNG_STABILITY_DAYS, STAGE_SEGMENTS } from '@/lib/cardStrength';
import { isMastered, MASTERY_STABILITY_DAYS } from '@/lib/achievements';
import type { DeckWord } from '@/lib/types';

const card = (over: Partial<DeckWord> = {}): DeckWord =>
  ({ h: 'casa', p: '', m: 'house', ...over }) as DeckWord;

describe('what stage a card is at', () => {
  it('calls an unreviewed card new, whatever stability it carries', () => {
    // A seeded or imported stability with no history is not evidence of a review.
    expect(cardStage(card({ reviews: 0, stability: 400 }))).toBe('new');
    expect(cardStage(card({}))).toBe('new');
  });

  it('separates settling from holding at a week', () => {
    expect(cardStage(card({ reviews: 1, stability: YOUNG_STABILITY_DAYS - 0.1 }))).toBe('learning');
    expect(cardStage(card({ reviews: 1, stability: YOUNG_STABILITY_DAYS }))).toBe('young');
  });

  it('reaches mature exactly at the mastery threshold', () => {
    expect(cardStage(card({ reviews: 3, stability: MASTERY_STABILITY_DAYS - 0.1 }))).toBe('young');
    expect(cardStage(card({ reviews: 3, stability: MASTERY_STABILITY_DAYS }))).toBe('mature');
  });

  it('draws nothing for a new card and fills the track for a mature one', () => {
    // Zero is the honest figure: a partly-filled bar on a freshly imported deck would suggest
    // progress that has not happened.
    expect(stageFill('new')).toBe(0);
    expect(stageFill('mature')).toBe(STAGE_SEGMENTS);
  });

  it('never fills more segments than the track has', () => {
    for (const s of ['new', 'learning', 'young', 'mature'] as const) {
      expect(stageFill(s)).toBeGreaterThanOrEqual(0);
      expect(stageFill(s)).toBeLessThanOrEqual(STAGE_SEGMENTS);
    }
  });

  it('rises monotonically with stability', () => {
    const fills = [0, 3, 10, 40].map(stability => stageFill(cardStage(card({ reviews: 2, stability }))));
    expect(fills).toEqual([...fills].sort((a, b) => a - b));
  });

  it('labels every stage in words rather than in Anki vocabulary', () => {
    for (const s of ['new', 'learning', 'young', 'mature'] as const) {
      const label = stageLabel(s);
      expect(label.length).toBeGreaterThan(8);
      // "young"/"mature" are precise to somebody who already knows the system and meaningless
      // to everybody else — the judgement that renamed the SRS tab to Review.
      expect(label.toLowerCase()).not.toContain('young');
      expect(label.toLowerCase()).not.toContain('mature');
    }
  });
});

describe('⚠ mature and mastered are ONE claim', () => {
  it('agrees with isMastered on every card', () => {
    // The control: a second threshold here would have the deck list and the milestone cabinet
    // disagreeing about which words are held, in an app where both are two taps apart.
    const cards = [0, 1, 6.9, 7, 29.9, 30, 400].flatMap(stability =>
      [0, 1, 5].map(reviews => card({ reviews, stability })));
    for (const c of cards) {
      expect(cardStage(c) === 'mature', `stability=${c.stability} reviews=${c.reviews}`)
        .toBe(isMastered(c));
    }
  });
});
