import { describe, it, expect } from 'vitest';
import { yearInReading, MIN_DAYS_TO_SHOW, YEAR_DAYS, type YearInput } from '@/lib/yearInReading';
import type { DeckWord, ShelfEntry } from '@/lib/types';
import { MAX_ENTRIES } from '@/lib/shelf';
import { MASTERY_STABILITY_DAYS } from '@/lib/achievements';

/**
 * A PURE FUNCTION OF ITS INPUTS, tested with no network and no clock — the shape
 * `lib/proverb.ts` and `lib/passageTheme.ts` already use. `today` is injected for exactly that
 * reason: a look-back that reads the wall clock can only be tested on the day it was written.
 */

const day = (d: string, n: number) => ({ d, n });

function input(over: Partial<YearInput> = {}): YearInput {
  return {
    log: [], shelves: {}, decks: {}, srs: null, lessonsDone: [],
    today: '2026-09-29', shelfCap: MAX_ENTRIES, ...over,
  };
}

/** A run of consecutive days ending the day before `end`, oldest first. */
function consecutive(count: number, end = '2026-09-29'): { d: string; n: number }[] {
  const [y, m, d] = end.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const x = new Date(y, m - 1, d - (count - 1 - i));
    const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return day(iso, 10);
  });
}

describe('the window', () => {
  it('counts only what falls inside the year', () => {
    const r = yearInReading(input({
      log: [day('2026-09-28', 5), day('2024-01-01', 900), day('2026-09-29', 7)],
    }));
    expect(r.cardsGraded).toBe(12);
    expect(r.daysStudied).toBe(2);
  });

  it('excludes the day one past the far edge — the control for the boundary', () => {
    const [y, m, d] = '2026-09-29'.split('-').map(Number);
    const edge = new Date(y, m - 1, d - (YEAR_DAYS - 1));
    const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const justOutside = new Date(edge); justOutside.setDate(justOutside.getDate() - 1);
    const r = yearInReading(input({ log: [day(iso(edge), 3), day(iso(justOutside), 99)] }));
    expect(r.cardsGraded).toBe(3);
  });

  it('ignores a recorded day with nothing graded', () => {
    const r = yearInReading(input({ log: [day('2026-09-28', 0), day('2026-09-29', 4)] }));
    expect(r.daysStudied).toBe(1);
  });
});

describe('the longest run is not the streak', () => {
  /**
   * `SRSState.streak` is the run ending TODAY and is allowed to fall to 1; this is the best run
   * anywhere in the window and describes only the past. A retrospective wants the second,
   * because it is the one number here a bad week cannot take away.
   */
  it('finds a run that ended long ago', () => {
    const r = yearInReading(input({
      log: [...consecutive(9, '2026-06-10'), day('2026-09-29', 1)],
    }));
    expect(r.longestRun).toBe(9);
  });

  it('breaks the run on a single missed day', () => {
    const r = yearInReading(input({
      log: [day('2026-09-20', 1), day('2026-09-21', 1), day('2026-09-23', 1)],
    }));
    expect(r.longestRun).toBe(2);
  });

  it('is 0 with nothing recorded', () => {
    expect(yearInReading(input()).longestRun).toBe(0);
  });
});

describe('the monthly series keeps its empty months', () => {
  /**
   * A bar chart that omits the months with nothing in them draws a DIFFERENT SHAPE from the one
   * the year actually had — four busy months in a row, when they were four busy months spread
   * over nine. The gap is the finding.
   */
  it('includes a month with no activity between two that have it', () => {
    const r = yearInReading(input({
      log: [day('2026-06-02', 5), day('2026-08-02', 5)],
    }));
    expect(r.months.map(m => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
    expect(r.months.find(m => m.month === '2026-07')!.cards).toBe(0);
  });

  /** It starts where the RECORD starts, so six weeks of study is not drawn as ten empty columns
   *  and labelled a year. */
  it('starts at the first recorded month, not a year ago', () => {
    const r = yearInReading(input({ log: [day('2026-09-02', 5)] }));
    expect(r.months).toHaveLength(1);
    expect(r.firstRecorded).toBe('2026-09-02');
  });
});

describe('reading is measured with the shelf’s own ruler', () => {
  const es = (date: string, text: string): ShelfEntry =>
    ({ id: date, date, language: 'es', level: 1, title: 't', text, vocabWords: [] });
  const zh = (date: string, text: string): ShelfEntry =>
    ({ id: date, date, language: 'zh', level: 1, title: 't', text, vocabWords: [] });

  it('counts words in a spaced language and characters in an unspaced one', () => {
    const r = yearInReading(input({
      shelves: { es: [es('2026-09-01', 'uno dos tres cuatro')], zh: [zh('2026-09-01', '我今天很好')] },
    }));
    expect(r.byLanguage.find(l => l.language === 'es')!.wordsRead).toBe(4);
    expect(r.byLanguage.find(l => l.language === 'zh')!.wordsRead).toBe(5);
    expect(r.passages).toBe(2);
  });

  it('drops a shelf entry from outside the window', () => {
    const r = yearInReading(input({ shelves: { es: [es('2020-01-01', 'uno dos')] } }));
    expect(r.passages).toBe(0);
    expect(r.byLanguage).toHaveLength(0);
  });

  /**
   * The shelf caps at MAX_ENTRIES PER LANGUAGE and drops the oldest, so a heavy reader's early
   * months are simply gone. The page has to say so rather than quietly undercount — and raising
   * the cap is not the fix, because 200 × ~700 B × four languages is already ~560 kB of a 5 MB
   * budget that also holds every deck.
   */
  it('reports a language sitting at the cap', () => {
    const full = Array.from({ length: MAX_ENTRIES }, () => es('2026-09-01', 'uno dos'));
    expect(yearInReading(input({ shelves: { es: full } })).shelfMayBeClipped).toEqual(['es']);
  });

  it('says nothing about clipping one entry below the cap — the control', () => {
    const nearly = Array.from({ length: MAX_ENTRIES - 1 }, () => es('2026-09-01', 'uno dos'));
    expect(yearInReading(input({ shelves: { es: nearly } })).shelfMayBeClipped).toEqual([]);
  });
});

describe('the deck contributes a COUNT, never a series', () => {
  const word = (h: string, stability?: number): DeckWord =>
    ({ h, p: '', m: 'x', ...(stability === undefined ? {} : { stability, reviews: 3 }) });

  it('counts what is held now, and what is holding', () => {
    const r = yearInReading(input({
      decks: {
        es: [word('uno'), word('dos', MASTERY_STABILITY_DAYS + 1)],
        fr: [word('trois', MASTERY_STABILITY_DAYS + 5)],
      },
    }));
    expect(r.wordsHeld).toBe(3);
    expect(r.wordsMastered).toBe(2);
  });

  /**
   * THE REFUSAL, PINNED. `DeckWord` has no created-at, so no window can change these two
   * numbers — and a test that moves the window and watches them stay put is what stops somebody
   * later "fixing" that by writing a timestamp on every save to fill a chart.
   */
  it('is unaffected by which year is being asked about', () => {
    const decks = { es: [word('uno'), word('dos', MASTERY_STABILITY_DAYS + 1)] };
    const a = yearInReading(input({ decks, today: '2026-09-29' }));
    const b = yearInReading(input({ decks, today: '2030-01-01' }));
    expect([a.wordsHeld, a.wordsMastered]).toEqual([b.wordsHeld, b.wordsMastered]);
  });
});

describe('a page nobody should see', () => {
  /**
   * ABSENT, NOT ZEROED. `npm run seed:dev` exists because a wall of empty progress bars is a
   * list of things you have failed to do, and a retrospective of nothing is the worst version
   * of that.
   */
  it('is sparse just below the threshold and not at it', () => {
    expect(yearInReading(input({ log: consecutive(MIN_DAYS_TO_SHOW - 1) })).sparse).toBe(true);
    expect(yearInReading(input({ log: consecutive(MIN_DAYS_TO_SHOW) })).sparse).toBe(false);
  });

  it('is sparse with nothing at all', () => {
    expect(yearInReading(input()).sparse).toBe(true);
  });
});

describe('it is a pure function', () => {
  it('gives the same answer twice and does not mutate its input', () => {
    const log = [day('2026-09-01', 3), day('2026-09-02', 9)];
    const frozen = JSON.stringify(log);
    const a = yearInReading(input({ log }));
    const b = yearInReading(input({ log }));
    expect(a).toEqual(b);
    expect(JSON.stringify(log)).toBe(frozen);
  });

  it('names the busiest day', () => {
    const r = yearInReading(input({ log: [day('2026-09-01', 3), day('2026-09-02', 90), day('2026-09-03', 9)] }));
    expect(r.busiest).toEqual({ day: '2026-09-02', n: 90 });
  });
});
