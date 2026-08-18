'use client';
import { useMemo } from 'react';
import type { DeckWord } from '@/lib/types';
import { dateInDays, isActive, isNewCard, todayStr } from '@/lib/deck';
import { getSrsSettings } from '@/lib/fsrs';

/**
 * What the scheduler is about to ask for: reviews falling due over the next seven days.
 *
 * This is a forecast of WORK ALREADY COMMITTED, not a prediction. Every bar is cards whose
 * `dueAt` FSRS has already written, so the only thing that moves them is grading them —
 * which is exactly what makes it useful: it shows the wave you built by activating a batch,
 * before it lands on you.
 *
 * FOUR THINGS IT REFUSES TO DO, each of which would flatter the number:
 *
 *  - Silent optimism about the backlog. Anything overdue is due NOW, so it is stacked into
 *    today rather than left off the chart. A forecast that starts at zero while forty cards
 *    are already late is describing a different deck than the one you have.
 *  - Counting cards that cannot appear. Pooled, paused and snoozed cards are excluded via
 *    the same `isActive` the queues use, so the chart cannot promise work the app will not
 *    hand out.
 *  - Treating new cards as scheduled. A never-reviewed card has no real due date; it enters
 *    circulation through the daily new-card budget, not the calendar. Those are shown as a
 *    separate, honestly-labelled layer.
 *  - Hiding the cap. The reviews/day setting is drawn as a line, because a 300-card Thursday
 *    against a 200/day limit does not mean 300 reviews — it means 200 and a bigger Friday.
 */

interface Props { deck: DeckWord[]; }

const DAYS = 7;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function FutureLoad({ deck }: Props) {
  const { bars, peak, cap, capVisible, overdue, newWaiting } = useMemo(() => {
    const today = todayStr();
    const active = deck.filter(w => isActive(w, today));

    // New cards are not on the calendar — they arrive through the daily budget.
    const scheduled = active.filter(w => !isNewCard(w));
    const newWaiting = active.filter(isNewCard).length;

    const overdue = scheduled.filter(w => !w.dueAt || w.dueAt <= today).length;

    const bars = Array.from({ length: DAYS }, (_, i) => {
      const date = dateInDays(i);
      const due = i === 0
        ? overdue                                    // backlog lands today, not nowhere
        : scheduled.filter(w => w.dueAt === date).length;
      const d = new Date(); d.setDate(d.getDate() + i);
      return { date, due, label: i === 0 ? 'Today' : WEEKDAY[d.getDay()], dayNum: d.getDate() };
    });

    const cap = getSrsSettings().reviewsPerDay;
    // Headroom so a light week still reads as light rather than filling the frame.
    const peak = Math.max(1, ...bars.map(b => b.due), cap * 0.6);
    return { bars, peak, cap, capVisible: cap <= peak, overdue, newWaiting };
  }, [deck]);

  const total = bars.reduce((a, b) => a + b.due, 0);
  const H = 108;

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Future load · next 7 days
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
          {total.toLocaleString()} review{total === 1 ? '' : 's'} scheduled
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '6px 0 14px', maxWidth: '54ch', lineHeight: 1.5 }}>
        {total === 0
          ? 'Nothing scheduled yet. Cards appear here once they have been reviewed at least once and FSRS has given them a date.'
          : <>Cards FSRS has already dated. {overdue > 0 && <>Anything overdue counts as <strong style={{ color: 'var(--ink)' }}>today</strong>, not as a day you missed. </>}{/* Only promised when it is actually drawn — the line is omitted when the cap sits
                     above the chart, and copy describing a line that is not there is worse than
                     no copy. */}
            {capVisible && <>The dashed line is your {cap}/day review limit.</>}</>}
      </p>

      <div className="flex items-end gap-2" style={{ height: H, position: 'relative' }}>
        {/* The cap, drawn only when it is actually in frame. */}
        {capVisible && (
          <div aria-hidden="true" style={{
            position: 'absolute', left: 0, right: 0, bottom: (cap / peak) * H,
            borderTop: '1px dashed color-mix(in srgb, var(--accent) 55%, transparent)', pointerEvents: 'none',
          }} />
        )}
        {bars.map(b => {
          const h = Math.max(b.due > 0 ? 3 : 1, (b.due / peak) * H);
          const over = b.due > cap;
          return (
            <div key={b.date} className="flex-1 flex flex-col items-center justify-end" style={{ height: H }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: b.due ? 'var(--ink-soft)' : 'var(--ink-faint)', marginBottom: 3 }}>
                {b.due || ''}
              </div>
              <div
                title={`${b.date} — ${b.due} review${b.due === 1 ? '' : 's'}${over ? ` (over your ${cap}/day limit)` : ''}`}
                style={{
                  width: '100%', height: h, borderRadius: '4px 4px 2px 2px',
                  background: b.due === 0
                    ? 'var(--line-soft)'
                    : over ? 'var(--accent-deep, var(--accent))' : 'var(--accent)',
                  opacity: b.due === 0 ? 1 : 0.9,
                  transition: 'height .4s ease',
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 mt-1.5">
        {bars.map(b => (
          <div key={b.date} className="flex-1 text-center" style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.04em' }}>
            {b.label}
          </div>
        ))}
      </div>

      {newWaiting > 0 && (
        <p style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 10, lineHeight: 1.5 }}>
          Plus {newWaiting.toLocaleString()} new card{newWaiting === 1 ? '' : 's'} waiting — those are not on the
          calendar. They enter through your {getSrsSettings().newPerDay}/day new-card limit, so they arrive at
          that rate whenever you study.
        </p>
      )}
    </div>
  );
}
