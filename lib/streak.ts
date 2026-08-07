import type { DeckWord, SRSState } from './types';
import { isActive } from './deck';

/**
 * The honest streak.
 *
 * A streak is supposed to say "you kept up with your studying". The naive version says
 * something else — "you opened the app" — and it punishes the one behaviour a spaced
 * repetition app exists to produce: coming back exactly when the scheduler asks you to,
 * and not before. If FSRS gives you nothing to review on Tuesday, Tuesday is not a day
 * you slacked off. Breaking a 40-day streak for obeying the schedule teaches the learner
 * to distrust the schedule, which is the opposite of the point.
 *
 * So two changes to the usual rule:
 *
 *   ACTIVITY IS BROADER than a graded flashcard session. Finishing the daily reading
 *   counts too — see recordActivity in hooks/useSRS.ts.
 *
 *   A GAP IS FORGIVEN when the learner owed nothing on the days they missed. This is
 *   checked retroactively against the deck, per missed day, and it is a real check: one
 *   card due on one missed day is enough to break the streak.
 *
 * WHY THE RETROACTIVE CHECK IS SOUND
 * A card's `dueAt` only moves when the card is reviewed. Across a gap the learner was by
 * definition not reviewing, so every card's `dueAt` today is the same value it had during
 * the gap — which makes "was this card due on day D" exactly `dueAt <= D`, computed from
 * present data. The one case that breaks the reasoning is a card reviewed *after* the last
 * active day, whose old due date is gone; `reviewedSince` below counts those as due, so an
 * unknown never becomes a free pass.
 *
 * WHEN IT RUNS
 * Once per gap, at load, before the day's reviews have moved any due dates — and the
 * result is persisted by advancing `lastActive`, so it is never recomputed against mutated
 * data. See reconcileStreak.
 */

/** Every calendar day strictly between `from` and `to`, ascending. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  cur.setDate(cur.getDate() + 1);
  while (cur < end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * How many cards the learner owed on `day`, judged from the deck as it stands.
 *
 * `since` is the last active day: a card reviewed after it has had its due date rewritten,
 * so its state on `day` is unknowable and it is counted as due rather than assumed away.
 *
 * A card with no `dueAt` is owed, matching isDueToday's reading of the same field — an
 * imported level sitting untouched is work outstanding, not a rest day. Pool cards are
 * staged rather than outstanding and isActive already excludes them, which is what keeps
 * "import 500 words, study none" from reading as a 500-card debt.
 */
export function dueCountOn(deck: DeckWord[], day: string, since: string): number {
  return deck.filter(w => {
    if (!isActive(w, day)) return false;
    if (w.lastReview && w.lastReview > since) return true;   // rewritten; can't be ruled out
    return !w.dueAt || w.dueAt <= day;
  }).length;
}

export interface GapVerdict {
  /** Missed days on which nothing was owed. */
  forgiven: string[];
  /** The first missed day that DID have cards due, if any — the day the streak broke. */
  brokenOn: string | null;
}

/**
 * Judge the days missed between `lastActive` and `today`.
 *
 * Forgiveness requires a real schedule to have been kept: with an empty deck every day is
 * vacuously restful, and an eternal streak for owning no cards would be exactly the hollow
 * number this is meant to avoid.
 */
export function judgeGap(deck: DeckWord[], lastActive: string, today: string): GapVerdict {
  const missed = daysBetween(lastActive, today);
  if (missed.length === 0) return { forgiven: [], brokenOn: null };
  if (!deck.some(w => isActive(w, today))) return { forgiven: [], brokenOn: missed[0] };

  const forgiven: string[] = [];
  for (const day of missed) {
    if (dueCountOn(deck, day, lastActive) > 0) return { forgiven, brokenOn: day };
    forgiven.push(day);
  }
  return { forgiven, brokenOn: null };
}

/** Days of forgiveness history kept, for the "N rest days" note. */
const FORGIVEN_WINDOW = 60;

/**
 * Settle any gap since the last active day, exactly once.
 *
 * Returns the state to persist, or null when there is nothing to settle. Forgiveness is
 * recorded by moving `lastActive` up to yesterday: the streak is then contiguous again, so
 * everything downstream can keep using the plain "was I active yesterday?" test, and the
 * expensive judgement is never repeated against a deck whose due dates have since moved.
 */
export function reconcileStreak(
  state: SRSState,
  deck: DeckWord[],
  today: string,
  yesterday: string,
): SRSState | null {
  const lastActive = state.lastActive ?? state.todayScoreDate;  // pre-lastActive states
  if (!lastActive || lastActive >= yesterday) return null;      // no gap worth judging

  const { forgiven, brokenOn } = judgeGap(deck, lastActive, today);

  if (brokenOn) {
    if (state.streak === 0 && !state.lastActive) return null;   // already settled
    return { ...state, streak: 0, lastActive: '', forgivenDays: [] };
  }

  return {
    ...state,
    lastActive: yesterday,   // the rest days close the gap; the streak stays contiguous
    forgivenDays: [...(state.forgivenDays ?? []), ...forgiven].slice(-FORGIVEN_WINDOW),
  };
}

/**
 * Fold one day's activity into the streak.
 *
 * By the time this runs, reconcileStreak has already settled any gap, so the only cases
 * left are "already counted today", "carried on from yesterday", and "starting over".
 */
export function applyActivity(state: SRSState, today: string, yesterday: string): SRSState {
  const lastActive = state.lastActive ?? state.todayScoreDate;
  const streak =
    lastActive === today     ? state.streak          // already counted today
    : lastActive === yesterday ? state.streak + 1    // contiguous (possibly via forgiveness)
    : 1;                                             // first day, or a break that stood
  return { ...state, streak, lastActive: today };
}

/** Rest days forgiven inside the current streak, for display. */
export function forgivenInStreak(state: SRSState, today: string): number {
  const since = daysBetween(dateMinus(today, state.streak + 1), today);
  const set = new Set(since);
  return (state.forgivenDays ?? []).filter(d => set.has(d)).length;
}

function dateMinus(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
