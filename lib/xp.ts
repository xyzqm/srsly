import type { DayActivity } from './activityLog';

/**
 * XP — A WEEK'S WORK, COUNTED FROM RECORDS THAT ALREADY EXIST.
 *
 * ## NOTHING IS STORED, AND THE WINDOW IS WHY THAT IS POSSIBLE
 *
 * The obvious build is a counter incremented on every action. This repo's first rule is to
 * store only what cannot be derived, and a lifetime XP total genuinely cannot be: the activity
 * log is pruned at `ACTIVITY_WINDOW_DAYS`, which `lib/activityLog.ts` is emphatic is a
 * DELETION policy rather than a display window. A lifetime total derived from it would quietly
 * FALL as old days aged out — an XP counter that goes down is worse than none.
 *
 * A WEEKLY total has no such problem. Seven days are always inside the window, so the figure
 * is exact, derived, needs no column and no migration, and cannot drift from the records it
 * describes because it IS those records.
 *
 * It is also the better product. A lifetime number is a wall somebody new can never climb and
 * somebody old can never lose; a week resets, so nobody is permanently behind. That is the
 * same reasoning `lib/achievements.ts` gives for an unlock only ever ADDING, reached from the
 * other direction — and it is what keeps a shared pact low-pressure rather than a race nobody
 * can re-enter.
 *
 * ## THE WEIGHTS ARE A JUDGEMENT AND ARE WRITTEN DOWN AS ONE
 *
 * They are not measured, because there is nothing to measure them against: no number makes a
 * lesson "worth" eleven flashcards. What they encode is that **the rarer and more deliberate
 * an act, the more it is worth** — grading a card is one tap of many in a sitting, finishing a
 * passage is a sitting, and finishing a lesson is a decision to study something new.
 *
 * The one real constraint is that no path may dominate: a learner who only reviews, only
 * reads, or only takes lessons should all be able to reach a reasonable weekly figure. A
 * 20-card session, one passage, and one lesson are deliberately within a factor of two of each
 * other.
 */

/** One graded card. The floor, and the unit the others are expressed in. */
export const XP_PER_CARD = 1;
/** One passage read to the end — a sitting, not a tap. */
export const XP_PER_PASSAGE = 12;
/** One lesson finished — the most deliberate of the three, and the rarest. */
export const XP_PER_LESSON = 15;

export interface XpBreakdown {
  cards: number;
  passages: number;
  lessons: number;
  total: number;
}

/** `YYYY-MM-DD` arithmetic, with no `Date` and so no timezone to get wrong. */
function inWindow(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}

/**
 * XP earned between two dates, inclusive at both ends.
 *
 * `passageDates` is one entry per finished passage, which is what the shelf already records —
 * see `lib/shelf.ts`. Days with no activity simply contribute nothing; there is no need to
 * enumerate them.
 */
export function xpIn(
  source: { log: DayActivity[]; passageDates: string[] },
  from: string,
  to: string,
): XpBreakdown {
  let cards = 0;
  let lessons = 0;
  for (const e of source.log) {
    if (!inWindow(e.d, from, to)) continue;
    // Clamped at zero: a corrupt or hand-edited log must not be able to subtract XP.
    cards += Math.max(0, e.n);
    lessons += Math.max(0, e.l ?? 0);
  }
  const passages = source.passageDates.filter(d => inWindow(d, from, to)).length;
  return {
    cards, passages, lessons,
    total: cards * XP_PER_CARD + passages * XP_PER_PASSAGE + lessons * XP_PER_LESSON,
  };
}

/**
 * The Monday of `today`'s week, and the Sunday that ends it.
 *
 * ⚠ MONDAY, AND A FIXED RESET RATHER THAN A ROLLING SEVEN DAYS. A rolling window is easier and
 * is the wrong shape for anything shared: two people looking at the same pact on the same day
 * would be looking at two different windows, so their numbers could not be compared — which is
 * the entire point of putting them side by side. A named week is the same week for everyone.
 *
 * Monday rather than Sunday because the reset should land where a week feels like it starts;
 * `getUTCDay()` returns 0 for Sunday, which is the off-by-one this expression exists to fix.
 */
export function weekBounds(today: string): { from: string; to: string } {
  const [y, m, d] = today.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay();          // 0 = Sunday
  const back = (dow + 6) % 7;                   // days since Monday
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(t - back * 86_400_000), to: iso(t + (6 - back) * 86_400_000) };
}

/** XP so far in the week containing `today`. */
export function xpThisWeek(
  source: { log: DayActivity[]; passageDates: string[] },
  today: string,
): XpBreakdown {
  const { from, to } = weekBounds(today);
  return xpIn(source, from, to);
}
