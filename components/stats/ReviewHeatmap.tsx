'use client';
import { useMemo } from 'react';
import type { DeckWord } from '@/lib/types';
import { mergedActivity } from '@/lib/activityLog';

/**
 * Three months of study, one square per day.
 *
 * Columns are weeks and rows are weekdays, the arrangement GitHub made legible: it puts the
 * same weekday on the same row, so "I never study on Wednesdays" is visible as a pale stripe
 * rather than something you would have to count out.
 *
 * HONESTY ABOUT THE DATA. Days before the activity log existed are RECONSTRUCTED from each
 * card's `lastReview`, which records only its most recent grading — so those days are a floor
 * and are drawn hollow, with the legend saying so. Presenting an undercount as history would
 * misreport how much work someone did, and on a long-running deck it would misreport it
 * badly. Everything from `firstRecorded` onward is counted directly.
 */

interface Props { deck: DeckWord[]; }

const WEEKS = 13;              // 91 days — the "last 3 months" the label promises
const DAYS_PER_WEEK = 7;
const CELL = 12;
const GAP = 3;

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Five buckets. Thresholds are relative to the learner's own busiest day, because a fixed
 *  scale would render a 20-a-day reviewer as permanently cold and a 400-a-day one as
 *  permanently saturated. */
function intensity(n: number, max: number): number {
  if (n <= 0) return 0;
  if (max <= 1) return 4;
  const r = n / max;
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Wide enough for a three-letter weekday plus a little air. */
const GUTTER = 26;

export default function ReviewHeatmap({ deck }: Props) {
  const { grid, max, total, activeDays, firstRecorded, monthLabels } = useMemo(() => {
    const { counts, firstRecorded } = mergedActivity(deck);

    // End on the LAST day of the current week so today is never clipped mid-column, then
    // walk back a whole number of weeks — that is what keeps the rows aligned to weekdays.
    const end = new Date();
    end.setHours(12, 0, 0, 0);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - (WEEKS * DAYS_PER_WEEK - 1));

    const today = iso(new Date());
    const grid: { date: string; n: number; future: boolean }[][] = [];
    const monthLabels: { col: number; label: string }[] = [];
    let max = 0, total = 0, activeDays = 0;
    let lastMonth = -1;

    for (let w = 0; w < WEEKS; w++) {
      const col: { date: string; n: number; future: boolean }[] = [];
      for (let dow = 0; dow < DAYS_PER_WEEK; dow++) {
        const d = new Date(start);
        d.setDate(start.getDate() + w * DAYS_PER_WEEK + dow);
        const date = iso(d);
        const n = counts.get(date) ?? 0;
        if (date <= today) { max = Math.max(max, n); total += n; if (n > 0) activeDays++; }
        col.push({ date, n, future: date > today });
        if (dow === 0 && d.getMonth() !== lastMonth) {
          lastMonth = d.getMonth();
          monthLabels.push({ col: w, label: MONTHS[d.getMonth()] });
        }
      }
      grid.push(col);
    }
    /**
     * Drop the first month's label when it barely appears.
     *
     * The window is a rolling 91 days, so the leftmost month is whatever 13 weeks ago landed
     * in — often one or two columns. Labelling that put "May" hard against "Jun" with a single
     * column between them, which reads as a squashed collision rather than two months. GitHub
     * does the same thing: a partial leading month gets no label and the space stays blank.
     */
    const MIN_COLS_FOR_LABEL = 3;
    if (monthLabels.length > 1 && monthLabels[1].col - monthLabels[0].col < MIN_COLS_FOR_LABEL) {
      monthLabels.shift();
    }

    return { grid, max, total, activeDays, firstRecorded, monthLabels };
  }, [deck]);

  const swatch = (level: number) => level === 0
    ? 'var(--line-soft)'
    : `color-mix(in srgb, var(--accent) ${[0, 26, 48, 72, 100][level]}%, var(--line-soft))`;

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Review activity · last 3 months
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
          {total.toLocaleString()} card{total === 1 ? '' : 's'} over {activeDays} day{activeDays === 1 ? '' : 's'}
        </div>
      </div>
      {/* The window is a rolling 91 days, not three whole calendar months, so the leftmost
          columns belong to a month that is only partly shown. It used to say so, because a
          two-column "May" jammed against "Jun" needed explaining; now that a barely-present
          first month goes unlabelled there is nothing left to explain, and the width of the
          window is the only fact worth stating. */}
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-faint)', opacity: 0.8, marginTop: 2 }}>
        13 weeks to today
      </div>

      {total === 0 && (
        <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '6px 0 0', maxWidth: '52ch', lineHeight: 1.5 }}>
          Nothing recorded yet. Every card you grade — in flashcards or by finishing a passage —
          fills a square here.
        </p>
      )}

      <div className="mt-3" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'inline-block', minWidth: 'min-content' }}>
          {/* Month ruler, aligned to the week each month starts in. */}
          <div style={{ position: 'relative', height: 14, marginLeft: GUTTER + GAP }}>
            {monthLabels.map(({ col, label }) => (
              <span key={`${col}-${label}`} style={{
                position: 'absolute', left: col * (CELL + GAP),
                fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.06em',
              }}>{label}</span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: GAP }}>
            {/* Every weekday is labelled. Three of seven was the GitHub convention, which
                works there because the grid is enormous and the rhythm is obvious; at this
                size the blank rows just read as missing labels and you have to count to work
                out which row is which. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: GUTTER, flexShrink: 0 }}>
              {WEEKDAYS.map((d, i) => (
                <span key={i} style={{
                  height: CELL, lineHeight: `${CELL}px`,
                  fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-faint)',
                }}>{d}</span>
              ))}
            </div>

            {grid.map((col, w) => (
              <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                {col.map(({ date, n, future }) => {
                  const reconstructed = !future && n > 0 && (!firstRecorded || date < firstRecorded);
                  return (
                    <div
                      key={date}
                      title={future
                        ? date
                        : `${date} — ${n} card${n === 1 ? '' : 's'}${reconstructed ? ' (at least; reconstructed)' : ''}`}
                      style={{
                        width: CELL, height: CELL, borderRadius: 2.5,
                        background: future ? 'transparent' : swatch(intensity(n, max)),
                        border: future
                          ? '1px dashed color-mix(in srgb, var(--line) 60%, transparent)'
                          : reconstructed
                            ? '1px solid color-mix(in srgb, var(--accent) 55%, transparent)'
                            : '1px solid transparent',
                        // Reconstructed days are drawn hollow: the count is a floor, so a
                        // solid square would overstate what we actually know.
                        boxSizing: 'border-box',
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 flex-wrap" style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-faint)' }}>
        <span className="inline-flex items-center gap-1.5">
          less
          {[0, 1, 2, 3, 4].map(l => (
            <span key={l} style={{ width: CELL, height: CELL, borderRadius: 2.5, background: swatch(l), display: 'inline-block' }} />
          ))}
          more
        </span>
        {firstRecorded && (
          <span className="inline-flex items-center gap-1.5">
            <span style={{ width: CELL, height: CELL, borderRadius: 2.5, boxSizing: 'border-box', background: swatch(2), border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)', display: 'inline-block' }} />
            outlined = before {firstRecorded}, reconstructed from each card&apos;s last review — a minimum, not a total
          </span>
        )}
      </div>
    </div>
  );
}
