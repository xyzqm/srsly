import { describe, it, expect } from 'vitest';
import { monthLabels, MIN_COLS_FOR_LABEL } from '@/lib/heatmap';

/**
 * The month ruler above the review heatmap.
 *
 * This is date arithmetic whose failure renders as NOTHING — a missing label above real
 * squares — which is the class of bug nobody spots by looking and a test pins in one line.
 */

/** The grid the component builds: 13 columns of 7 `YYYY-MM-DD` days, Sunday first. */
function weeksFrom(firstSunday: string, weeks = 13): { date: string }[][] {
  const start = new Date(`${firstSunday}T12:00:00`);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      return { date: day.toISOString().slice(0, 10) };
    }),
  );
}

describe('a month is labelled where it begins', () => {
  /**
   * THE BUG THIS EXISTS FOR, reported from a real screenshot.
   *
   * The label used to be emitted only when a column's SUNDAY opened a new month — the same
   * thing only when the 1st happens to fall on one. On 2026-09-01 the 13-week window runs
   * 7 Jun → 5 Sep, so the last column is Aug 30 → Sep 5: its Sunday is in August, and
   * September's first Sunday (the 6th) is past the end of the window. Five of that column's
   * seven days were September and the column sat unheaded above today's own squares.
   */
  it('labels September even though its first Sunday falls outside the window', () => {
    const labels = monthLabels(weeksFrom('2026-06-07'));
    expect(labels.map(l => l.label)).toContain('Sep');
    expect(labels[labels.length - 1]).toEqual({ col: 12, label: 'Sep' });
  });

  it('labels each month exactly once, in order', () => {
    const labels = monthLabels(weeksFrom('2026-06-07'));
    expect(labels.map(l => l.label)).toEqual(['Jun', 'Jul', 'Aug', 'Sep']);
    const cols = labels.map(l => l.col);
    expect([...cols].sort((a, b) => a - b)).toEqual(cols);
  });

  /** A month whose 1st IS a Sunday is the case the old code got right; keep it right. */
  it('still handles a month that opens on a Sunday', () => {
    // 2026-11-01 is a Sunday.
    const labels = monthLabels(weeksFrom('2026-10-04'));
    expect(labels.map(l => l.label)).toContain('Nov');
  });

  it('places the label on the column containing the 1st', () => {
    const grid = weeksFrom('2026-06-07');
    const sep = monthLabels(grid).find(l => l.label === 'Sep')!;
    expect(grid[sep.col].some(c => c.date === '2026-09-01')).toBe(true);
  });
});

describe('a barely-present leading month is dropped', () => {
  /**
   * The window is a rolling 91 days, so the leftmost month is whatever 13 weeks ago landed
   * in. Labelling a one-column sliver put it hard against the next month and read as a
   * squashed collision; GitHub drops it for the same reason.
   */
  it('drops the first label when the next month arrives too close behind it', () => {
    // Week of 24 May 2026: column 0 is 24–30 May with no 1st in it, and June opens in
    // column 1 — a single column of May, which is the sliver the rule exists to suppress.
    const labels = monthLabels(weeksFrom('2026-05-24'));
    expect(labels[0].label).not.toBe('May');
    expect(labels[0].label).toBe('Jun');
  });

  /**
   * The regression this rule caused the first time. The week of 31 May runs into 6 June, so
   * the leading column CONTAINS June's 1st — naming it for its own first day called it "May"
   * and then dropped June entirely, because June had opened in a column already spent.
   */
  it('names a leading column for the month that opens inside it', () => {
    const labels = monthLabels(weeksFrom('2026-05-31'));
    expect(labels[0]).toEqual({ col: 0, label: 'Jun' });
    expect(labels.map(l => l.label)).toContain('Jul');
  });

  it('keeps the first label when the month has room', () => {
    const labels = monthLabels(weeksFrom('2026-06-07'));
    expect(labels[0].label).toBe('Jun');
    expect(labels[1].col - labels[0].col).toBeGreaterThanOrEqual(MIN_COLS_FOR_LABEL);
  });
});

describe('degenerate input', () => {
  it('returns nothing for an empty grid', () => {
    expect(monthLabels([])).toEqual([]);
  });

  it('survives an empty column without throwing', () => {
    expect(() => monthLabels([[], [{ date: '2026-09-01' }]])).not.toThrow();
  });

  it('labels a single-column grid with its own month', () => {
    expect(monthLabels(weeksFrom('2026-09-06', 1))).toEqual([{ col: 0, label: 'Sep' }]);
  });
});
