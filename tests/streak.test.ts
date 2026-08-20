import { describe, it, expect } from 'vitest';
import { languageActivity, languageStreakDisplay } from '@/lib/streak';
import type { DeckWord, LanguageStreak } from '@/lib/types';

const day = (n: number) => {
  const d = new Date('2026-08-19T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const TODAY = day(0), YEST = day(-1);

const due = (dueAt: string): DeckWord => ({ id: 'd', h: 'd', p: '', m: '', dueAt, reviews: 1, stability: 3 });

describe('a language streak counts its own language only', () => {
  it('starts at 1', () => {
    expect(languageActivity(undefined, [], TODAY, YEST).streak).toBe(1);
  });

  it('increments when yesterday was active', () => {
    const prev: LanguageStreak = { streak: 4, lastActive: YEST };
    expect(languageActivity(prev, [], TODAY, YEST).streak).toBe(5);
  });

  it('does not double-count the same day', () => {
    const prev: LanguageStreak = { streak: 4, lastActive: TODAY };
    expect(languageActivity(prev, [], TODAY, YEST).streak).toBe(4);
  });

  it('breaks when a card in THIS language was due on a missed day', () => {
    const prev: LanguageStreak = { streak: 9, lastActive: day(-3) };
    // Due two days ago and never reviewed — a day that was genuinely missed.
    const out = languageActivity(prev, [due(day(-2))], TODAY, YEST);
    expect(out.streak).toBe(1);
  });

  it('forgives a gap when nothing in this language was due', () => {
    const prev: LanguageStreak = { streak: 9, lastActive: day(-3) };
    const out = languageActivity(prev, [due(day(30))], TODAY, YEST);
    expect(out.streak).toBe(10);
  });
});

describe('display is live only while it reaches today or yesterday', () => {
  it('shows the number when active yesterday', () => {
    expect(languageStreakDisplay({ streak: 6, lastActive: YEST }, [due(day(30))], TODAY, YEST).streak).toBe(6);
  });

  it('shows 0 for a language never studied', () => {
    expect(languageStreakDisplay(undefined, [], TODAY, YEST).streak).toBe(0);
  });

  it('shows 0 once the run has lapsed with work outstanding', () => {
    const stale: LanguageStreak = { streak: 12, lastActive: day(-5) };
    expect(languageStreakDisplay(stale, [due(day(-4))], TODAY, YEST).streak).toBe(0);
  });
});
