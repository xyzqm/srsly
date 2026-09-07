import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import hskLevels from '@data/hsk-levels.json';
import {
  writableChars, isWritingDue, dueWritingChars, gradeFromStrokes, scheduleWriting,
  mergeWritingCards, mergeWritingState, type WritingCards,
} from '@/lib/writingState';

/**
 * Handwriting practice: the character set, the schedule, and the firewall.
 *
 * The merge tests are the load-bearing ones. A device writes its merged copy back and the
 * cloud then holds the merge, so the rule has to be idempotent AND commutative — the same
 * requirement `lib/reviewCounts.ts` and `lib/srsStateMerge.ts` document. A rule that is
 * merely deterministic ("mine wins ties") makes two devices ping-pong for ever, and nothing
 * about that failure is visible from one device.
 */

const ROOT = path.join(__dirname, '..');

describe('the practice set is derived from the deck, per character', () => {
  it('breaks words into characters and dedups across them', () => {
    const chars = writableChars([{ h: '朋友' }, { h: '友好' }, { h: '好' }]);
    expect(new Set(chars)).toEqual(new Set(['朋', '友', '好']));
  });

  /** A deck word can hold Latin text or punctuation, and no stroke data exists for those. */
  it('drops anything that is not Han', () => {
    expect(writableChars([{ h: 'OK' }, { h: '好，好' }])).toEqual(['好']);
  });

  it('is empty for a deck with nothing writable', () => {
    expect(writableChars([{ h: 'comer' }, { h: 'être' }])).toEqual([]);
  });

  /**
   * WRITING IS A SMALLER SET THAN THE DECK, which is the point of keying on characters.
   * If this ever inverts, the per-character design has stopped paying for itself.
   */
  it('collapses HSK’s words to far fewer characters', () => {
    const levels = hskLevels as unknown as Record<string, string[]>;
    const words = Object.values(levels).flat();
    const chars = writableChars(words.map(h => ({ h })));
    expect(words.length).toBeGreaterThan(4900);
    expect(chars.length).toBe(2663);
    expect(chars.length).toBeLessThan(words.length / 1.8);
  });
});

describe('the stroke data actually covers what the deck can ask for', () => {
  /**
   * Pins the BUILD OUTPUT, not the library. `scripts/build-strokes.mjs` subsets 9,574
   * upstream characters down to HSK; if that subset ever misses one, a learner taps Write on
   * a real card and gets nothing — and it would be discovered by them rather than by CI.
   */
  it('has a stroke file for every HSK character', () => {
    const dir = path.join(ROOT, 'public', 'strokes');
    const have = new Set(
      fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)),
    );
    const levels = hskLevels as unknown as Record<string, string[]>;
    const want = writableChars(Object.values(levels).flat().map(h => ({ h })));
    expect(want.filter(c => !have.has(c))).toEqual([]);
    expect(have.size).toBe(2663);
  });

  /** APL §1 and §2(a): the licence and a statement of what we changed travel with the data. */
  it('ships the licence and the modification notice beside it', () => {
    const dir = path.join(ROOT, 'public', 'strokes');
    expect(fs.existsSync(path.join(dir, 'ARPHICPL.TXT'))).toBe(true);
    const notice = fs.readFileSync(path.join(dir, 'MODIFICATIONS.txt'), 'utf8');
    expect(notice).toContain('ARPHIC PUBLIC LICENSE');
    expect(notice).toContain('DELETED');
  });
});

describe('due-ness', () => {
  /** Never practised means due — the same "absent means now" rule the deck's dueAt uses. */
  it('treats an unpractised character as due', () => {
    expect(isWritingDue(undefined, '2026-09-07')).toBe(true);
    expect(isWritingDue({}, '2026-09-07')).toBe(true);
  });

  it('respects a future due date', () => {
    expect(isWritingDue({ dueAt: '2026-09-10' }, '2026-09-07')).toBe(false);
    expect(isWritingDue({ dueAt: '2026-09-07' }, '2026-09-07')).toBe(true);
    expect(isWritingDue({ dueAt: '2026-09-01' }, '2026-09-07')).toBe(true);
  });

  it('filters a character list to what is due', () => {
    const cards: WritingCards = { 好: { dueAt: '2026-09-30' }, 朋: { dueAt: '2026-09-01' } };
    expect(dueWritingChars(['好', '朋', '友'], cards, '2026-09-07')).toEqual(['朋', '友']);
  });
});

describe('a quiz result becomes a grade without asking the learner', () => {
  it('grades a clean attempt Good', () => {
    expect(gradeFromStrokes(0, false)).toBe(3);
  });

  it('grades a few wrong strokes Hard', () => {
    expect(gradeFromStrokes(1, false)).toBe(2);
    expect(gradeFromStrokes(2, false)).toBe(2);
  });

  it('grades three or more Again', () => {
    expect(gradeFromStrokes(3, false)).toBe(1);
    expect(gradeFromStrokes(9, false)).toBe(1);
  });

  /** Being shown the answer fails the question, however tidy the strokes afterwards were. */
  it('grades a hint Again even with perfect strokes', () => {
    expect(gradeFromStrokes(0, true)).toBe(1);
  });

  /** There is deliberately no Easy — a stroke count cannot observe "I knew this instantly". */
  it('never returns Easy', () => {
    for (let m = 0; m < 12; m++) {
      for (const hint of [true, false]) expect(gradeFromStrokes(m, hint)).not.toBe(4);
    }
  });
});

describe('scheduling reuses FSRS unchanged', () => {
  it('advances a new character and records the review', () => {
    const after = scheduleWriting(undefined, 3);
    expect(after.lastReview).toBeTruthy();
    expect(after.dueAt).toBeTruthy();
  });

  it('counts a failure as a lapse', () => {
    const once = scheduleWriting(undefined, 3);
    const failed = scheduleWriting(once, 1);
    expect(failed.lapses ?? 0).toBeGreaterThan(once.lapses ?? 0);
  });

  it('keeps the character out of any DeckWord shape — it carries no gloss', () => {
    const card = scheduleWriting(undefined, 3) as Record<string, unknown>;
    for (const forbidden of ['h', 'p', 'm']) expect(card[forbidden]).toBeUndefined();
  });
});

describe('merging: a card is owned whole, and the rule is commutative', () => {
  const older = { lastReview: '2026-09-01', reviews: 2, stability: 3, difficulty: 5, lapses: 0 };
  const newer = { lastReview: '2026-09-05', reviews: 3, stability: 9, difficulty: 6, lapses: 1 };

  it('takes the whole card from the later review, never a field-wise blend', () => {
    const merged = mergeWritingCards({ 好: older }, { 好: newer });
    expect(merged.好).toEqual(newer);
    // The blend would keep the higher stability AND the lower lapse count — a state neither
    // device was ever in. This is the same trap srsStateMerge documents for the streak.
    expect(merged.好.lapses).toBe(1);
  });

  it('unions characters only one side has', () => {
    const merged = mergeWritingCards({ 好: older }, { 朋: newer });
    expect(Object.keys(merged).sort()).toEqual(['好', '朋'].sort());
  });

  it('is commutative — the whole reason ties do not fall back to "mine"', () => {
    const a: WritingCards = { 好: older, 朋: newer, 友: {} };
    const b: WritingCards = { 好: newer, 友: { reviews: 1, lastReview: '2026-09-03' }, 学: older };
    expect(mergeWritingCards(a, b)).toEqual(mergeWritingCards(b, a));
  });

  it('is commutative even when two cards share a review date', () => {
    const x = { lastReview: '2026-09-05', reviews: 4, stability: 2 };
    const y = { lastReview: '2026-09-05', reviews: 4, stability: 8 };
    expect(mergeWritingCards({ 好: x }, { 好: y })).toEqual(mergeWritingCards({ 好: y }, { 好: x }));
  });

  /** Fully identical histories still have to resolve the same way on both devices. */
  it('is commutative for cards that are indistinguishable by history', () => {
    const x = { lastReview: '2026-09-05', reviews: 4, stability: 2, dueAt: '2026-09-08' };
    const y = { lastReview: '2026-09-05', reviews: 4, stability: 2, dueAt: '2026-09-09' };
    expect(mergeWritingCards({ 好: x }, { 好: y })).toEqual(mergeWritingCards({ 好: y }, { 好: x }));
  });

  it('is idempotent, because the merge gets written back and merged again', () => {
    const a: WritingCards = { 好: older, 朋: newer };
    const b: WritingCards = { 好: newer, 友: older };
    const once = mergeWritingCards(a, b);
    expect(mergeWritingCards(once, b)).toEqual(once);
    expect(mergeWritingCards(once, once)).toEqual(once);
  });

  it('merges language by language', () => {
    const merged = mergeWritingState({ zh: { 好: older } }, { zh: { 好: newer }, ja: { 学: older } });
    expect(merged.zh?.好).toEqual(newer);
    expect(merged.ja?.学).toEqual(older);
  });

  it('is commutative across languages too', () => {
    const a = { zh: { 好: older }, ja: { 学: newer } };
    const b = { zh: { 好: newer, 朋: older } };
    expect(mergeWritingState(a, b)).toEqual(mergeWritingState(b, a));
  });
});

describe('the firewall between writing and reading', () => {
  /**
   * THE DECISION THIS FILE EXISTS TO DEFEND. Writing is optional practice — a gym, not a daily
   * requirement — so being a month behind on it must never read as a broken reading streak.
   * That is a one-line change away from being false at any time, and the failure is silent:
   * the streak simply starts breaking and nobody connects it to a writing import.
   */
  const readingSurfaces = [
    'lib/deck.ts', 'lib/streak.ts', 'lib/reviewCounts.ts', 'lib/activityLog.ts',
    'lib/achievements.ts', 'lib/clozeTargets.ts', 'lib/deckSearch.ts',
  ];

  it('is not imported by anything that computes reading due-ness, the streak or the budget', () => {
    const offenders = readingSurfaces.filter(f => {
      const p = path.join(ROOT, f);
      return fs.existsSync(p) && /from '[^']*writingState'/.test(fs.readFileSync(p, 'utf8'));
    });
    expect(offenders).toEqual([]);
  });

  /**
   * And the traffic does not run the other way either: writing never reads the deck's queue.
   *
   * COMMENTS ARE STRIPPED FIRST, and that is not a loophole. This module's docstrings name
   * `isDueToday` repeatedly, because explaining which thing it is firewalled FROM is the whole
   * point of the prose. A raw substring check would fail on the documentation and push the next
   * person to delete the explanation in order to get CI green, which is precisely backwards.
   */
  it('does not call the reading queue’s due logic, the heatmap or the budget', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'writingState.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const forbidden of ['isDueToday', 'activityLog', 'reviewCounts', 'logGraded']) {
      expect(src).not.toContain(forbidden);
    }
  });
});
