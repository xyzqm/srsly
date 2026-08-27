import { describe, it, expect } from 'vitest';
import {
  computeStats, evaluate, isMastered, isRescuedLeech, MASTERY_STABILITY_DAYS,
  ACHIEVEMENTS, FAMILIES, collapse, toppedLadder, type EarnedAchievement,
} from '@/lib/achievements';
import { unannounced } from '@/lib/achievementsSeen';
import type { DeckWord, SRSState } from '@/lib/types';

const LEECH = 8;

// CLAUDE.md's fixture trap: a DeckWord without `lastReview` looks to FSRS like it was
// reviewed one second ago. None of these rules read elapsed time, but the fixtures carry
// lastReview anyway so they stay honest if one ever does.
const card = (over: Partial<DeckWord> = {}): DeckWord =>
  ({ id: 'c', h: '词', p: '', m: 'word', lastReview: '2026-06-01', ...over });

const srs = (over: Partial<SRSState> = {}): SRSState =>
  ({ streak: 0, lastVisit: '2026-08-22', todayScore: -1, todayScoreDate: '2026-08-22', ...over });

describe('mastery is stability, not review count', () => {
  it('counts a card that would survive a month', () => {
    expect(isMastered(card({ stability: MASTERY_STABILITY_DAYS, reviews: 1 }))).toBe(true);
  });

  // The reason the rule is not `reviews >= n`: eight passes on a card you keep forgetting is
  // not mastery, and FSRS already measures the difference.
  it('does not count a much-reviewed card that keeps being forgotten', () => {
    expect(isMastered(card({ reviews: 12, lapses: 9, stability: 2 }))).toBe(false);
  });

  it('does not count a brand-new card', () => {
    expect(isMastered(card())).toBe(false);
    expect(isMastered(card({ stability: 40 }))).toBe(false);   // stability but never reviewed
  });
});

describe('a rescued leech is one that was stuck and is not now', () => {
  it('counts a healed card', () => {
    expect(isRescuedLeech(card({ lapses: LEECH, leech: false }), LEECH)).toBe(true);
  });

  // The flag being absent is not evidence on its own — most cards were never stuck.
  it('does not count a card that was never a leech', () => {
    expect(isRescuedLeech(card({ lapses: 1 }), LEECH)).toBe(false);
  });

  it('does not count one that is still flagged or still paused', () => {
    expect(isRescuedLeech(card({ lapses: 10, leech: true }), LEECH)).toBe(false);
    expect(isRescuedLeech(card({ lapses: 10, paused: true }), LEECH)).toBe(false);
  });
});

describe('computeStats reads only what is already persisted', () => {
  it('totals across every language deck', () => {
    const stats = computeStats({
      decks: {
        es: [card({ h: 'casa', stability: 60, reviews: 4 }), card({ h: 'perro' })],
        zh: [card({ h: '猫', stability: 90, reviews: 9 })],
      },
      srs: srs({ streak: 12, sessions: 30, byLanguage: { es: { streak: 12 }, zh: { streak: 4 } } as never }),
      leechThreshold: LEECH,
    });
    expect(stats.mastered).toBe(2);
    expect(stats.deckSize).toBe(3);
    expect(stats.languagesStudied).toBe(2);
    expect(stats.bestLanguageStreak).toBe(12);
    expect(stats.sessions).toBe(30);
  });

  it('survives an empty deck and a state written before per-language streaks', () => {
    const stats = computeStats({ decks: {}, srs: srs(), leechThreshold: LEECH });
    expect(stats).toMatchObject({ mastered: 0, deckSize: 0, bestLanguageStreak: 0, languagesStudied: 0 });
  });

  it('does not count an empty deck as a language studied', () => {
    const stats = computeStats({ decks: { es: [], fr: [card()] }, srs: srs(), leechThreshold: LEECH });
    expect(stats.languagesStudied).toBe(1);
  });
});

describe('evaluate splits earned from close', () => {
  const stats = computeStats({
    decks: { es: Array.from({ length: 60 }, (_, i) => card({ h: `w${i}`, stability: 60, reviews: 3 })) },
    srs: srs({ streak: 8, sessions: 12 }),
    leechThreshold: LEECH,
  });

  it('earns every tier at or below what you have', () => {
    const { earned } = evaluate(stats);
    const ids = earned.map(a => a.id);
    expect(ids).toContain('mastered-10');
    expect(ids).toContain('mastered-50');
    expect(ids).not.toContain('mastered-100');
    expect(ids).toContain('streak-7');
    expect(ids).not.toContain('streak-30');
  });

  // Showing what is close is most of the point — a trophy cabinet does not get anyone back.
  it('orders the not-yet-earned by how close they are', () => {
    const { next } = evaluate(stats);
    const fractions = next.map(a => a.have / a.need);
    expect([...fractions].sort((a, b) => b - a)).toEqual(fractions);
  });

  it('reports progress so the UI can say 8/30', () => {
    const { next } = evaluate(stats);
    const streak30 = next.find(a => a.id === 'streak-30')!;
    expect(streak30).toMatchObject({ have: 8, need: 30, earned: false });
  });

  it('earns nothing on a fresh account', () => {
    const fresh = computeStats({ decks: {}, srs: srs(), leechThreshold: LEECH });
    expect(evaluate(fresh).earned).toHaveLength(0);
  });
});

describe('announcing happens once', () => {
  it('only reports what has not been seen', () => {
    expect(unannounced(['a', 'b', 'c'], new Set(['a']))).toEqual(['b', 'c']);
  });

  it('reports nothing when everything is seen', () => {
    expect(unannounced(['a', 'b'], new Set(['a', 'b']))).toEqual([]);
  });
});

/**
 * The badge seal draws a rung out of a ladder, so the ladder has to be real: every milestone
 * in exactly one family, easiest first. Both of these are silent failures in the UI — a
 * milestone missing from FAMILIES renders as a lone unlabelled badge, and a family listed out
 * of order draws "1/5" on the hardest rung.
 */
describe('badge families cover the milestones, in order', () => {
  const zero = computeStats({ decks: {}, srs: srs(), leechThreshold: LEECH });

  it('places every milestone in exactly one family', () => {
    const listed = FAMILIES.flatMap(f => f.ids);
    const dupes = listed.filter((id, i) => listed.indexOf(id) !== i);
    expect(dupes, `id in two families: ${dupes.join(', ')}`).toEqual([]);

    const known = new Set(listed);
    const orphans = ACHIEVEMENTS.map(a => a.id).filter(id => !known.has(id));
    expect(orphans, `milestones with no family: ${orphans.join(', ')}`).toEqual([]);

    const ghosts = listed.filter(id => !ACHIEVEMENTS.some(a => a.id === id));
    expect(ghosts, `family names a milestone that does not exist: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('lists each family easiest first, so the tier number means something', () => {
    for (const f of FAMILIES) {
      const needs = f.ids.map(id => ACHIEVEMENTS.find(a => a.id === id)!.progress(zero).need);
      const ascending = [...needs].sort((a, b) => a - b);
      expect(needs, `${f.key} is out of order: ${needs.join(', ')}`).toEqual(ascending);
    }
  });
});

describe('collapsing shows one rung per family', () => {
  const mk = (id: string, have: number, need: number): EarnedAchievement =>
    ({ ...ACHIEVEMENTS.find(a => a.id === id)!, have, need, earned: have >= need });

  // The bug this replaces: passing 100 mastered words printed Vocabulary 10, 50 AND 100.
  it('keeps only the best rung of what is earned', () => {
    const got = collapse([mk('mastered-10', 100, 10), mk('mastered-50', 100, 50), mk('mastered-100', 100, 100)], 'last');
    expect(got).toHaveLength(1);
    expect(got[0].a.id).toBe('mastered-100');
    expect(got[0].tier).toBe(3);
    expect(got[0].tierCount).toBe(5);
  });

  it('keeps only the nearest rung of what is ahead', () => {
    const got = collapse([mk('streak-3', 1, 3), mk('streak-7', 1, 7)], 'first');
    expect(got).toHaveLength(1);
    expect(got[0].a.id).toBe('streak-3');
  });

  it('gathers the first-session milestones into the deck ladder rather than stranding them', () => {
    const got = collapse([mk('first-word', 30, 1), mk('first-steps', 30, 5), mk('deck-25', 30, 25)], 'last');
    expect(got).toHaveLength(1);
    expect(got[0].family.key).toBe('deck');
    expect(got[0].a.id).toBe('deck-25');
  });

  it('does not merge separate ladders', () => {
    const got = collapse([mk('mastered-10', 99, 10), mk('streak-2', 99, 2), mk('polyglot-2', 2, 2)], 'last');
    expect(got.map(b => b.family.key).sort()).toEqual(['mastered', 'polyglot', 'streak']);
  });

  /** Ids are the `srsly-achievements-seen` key — renaming one re-announces a milestone. */
  it('leaves every id untouched by the grouping', () => {
    expect(ACHIEVEMENTS.map(a => a.id)).toContain('first-word');
    expect(ACHIEVEMENTS.map(a => a.id)).toContain('lang-streak-30');
    expect(ACHIEVEMENTS.map(a => a.id)).toContain('leech-10');
  });
});

describe('gold is the top of a real ladder', () => {
  it('does not gild a one-rung milestone', () => {
    expect(toppedLadder(1, 1)).toBe(false);   // Two languages, Devoted
  });
  it('gilds the last rung of a real one, and nothing below it', () => {
    expect(toppedLadder(5, 5)).toBe(true);
    expect(toppedLadder(4, 5)).toBe(false);
  });
});
