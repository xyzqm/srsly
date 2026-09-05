import type { SRSState, LanguageStreak, LanguageCode, DailyAccuracy } from './types';

/**
 * Folding two devices' `srs_state` together, field by field.
 *
 * ── THE BUG THIS EXISTS FOR ──
 * `srs_state` was written as ONE BLOB, last-writer-wins. Every field travelled with every
 * save, so a device holding a stale copy reverted everything in the column the moment it
 * wrote anything: study on the laptop, then open the phone — which still believes the streak
 * is 9 — and the phone's next save takes it back to 9. Nothing errors. The learner sees their
 * streak walk backwards and has no way to tell that sync did it.
 *
 * ── WHY NOT MAX EVERYWHERE ──
 * MAX is the reflex, and it is right for the counters and WRONG for the streak, which is the
 * one field anybody watches. A streak is allowed to go DOWN: break it and it resets to 1. A
 * per-field maximum can never represent that, so a stale device holding 40 would resurrect a
 * streak the learner had already lost — the mirror of the bug being fixed, and a worse one,
 * because it silently inflates rather than deflates.
 *
 * So the streak is not merged at all: it is OWNED by whichever side studied most recently.
 * `lastActive` is exactly that date, it is already authoritative (lib/streak.ts persists a
 * reconciled streak by advancing it), and it moves in lockstep with the streak it explains.
 * Taking both from one side keeps them consistent — a streak from one device and a date from
 * the other is a state neither device was ever in.
 *
 * ── IDEMPOTENT AND COMMUTATIVE ──
 * A device writes its MERGED copy back, so the cloud then holds the merge and merging again
 * must change nothing — the same requirement `lib/reviewCounts.ts` documents. Every rule here
 * is max, union, or "pick a side by date", all of which have that property.
 */

/** Later of two dates, either of which may be absent. '' and undefined sort as earliest. */
function laterDate(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * The day a state last saw real study, which is what the streak is measured against.
 *
 * Falls back to `todayScoreDate` for states written before `lastActive` existed — the same
 * one-time fallback `useSRS` already performs, so an old state is not treated as never-active
 * and instantly outranked by any device that has the field.
 */
function activeDay(s: SRSState): string {
  return s.lastActive ?? s.todayScoreDate ?? '';
}

/** Union of two day lists, sorted, deduplicated. A forgiven day is a fact, not a preference. */
function unionDays(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) return undefined;
  return [...new Set([...(a ?? []), ...(b ?? [])])].sort();
}

/**
 * Per-day MAX, not a sum.
 *
 * Same reasoning as `mergeActivity`: a device writes its merged copy back, so summing
 * double-counts on every round trip (a+b, then a+b+b). The cost is that a day studied on two
 * devices reads as the busier of the two rather than the total, which is the undercount
 * posture this codebase already takes everywhere it merges a tally.
 */
function mergeAccuracy(a?: DailyAccuracy[], b?: DailyAccuracy[]): DailyAccuracy[] | undefined {
  if (!a && !b) return undefined;
  const by = new Map<string, DailyAccuracy>();
  for (const d of [...(a ?? []), ...(b ?? [])]) {
    const cur = by.get(d.d);
    by.set(d.d, cur
      ? { d: d.d, right: Math.max(cur.right, d.right), total: Math.max(cur.total, d.total) }
      : { ...d });
  }
  return [...by.values()].sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
}

/** One language's streak, by the same rule as the global one: the later day owns it. */
function mergeLanguageStreak(a: LanguageStreak, b: LanguageStreak): LanguageStreak {
  const winner = a.lastActive === b.lastActive
    ? (a.streak >= b.streak ? a : b)          // same day on both — the higher count is right
    : (a.lastActive > b.lastActive ? a : b);
  return {
    streak: winner.streak,
    lastActive: winner.lastActive,
    forgivenDays: unionDays(a.forgivenDays, b.forgivenDays),
  };
}

function mergeByLanguage(
  a?: Partial<Record<LanguageCode, LanguageStreak>>,
  b?: Partial<Record<LanguageCode, LanguageStreak>>,
): Partial<Record<LanguageCode, LanguageStreak>> | undefined {
  if (!a && !b) return undefined;
  const out: Partial<Record<LanguageCode, LanguageStreak>> = {};
  const langs = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})] as LanguageCode[]);
  for (const l of langs) {
    const x = a?.[l], y = b?.[l];
    out[l] = x && y ? mergeLanguageStreak(x, y) : (x ?? y)!;
  }
  return out;
}

export function mergeSRSState(a: SRSState | null, b: SRSState | null): SRSState {
  if (!a) return b!;
  if (!b) return a;

  // THE STREAK AND ITS DATE TRAVEL TOGETHER. See the note above: a streak taken from one
  // device beside a date taken from the other describes a state neither was ever in.
  const dayA = activeDay(a), dayB = activeDay(b);
  const owner = dayA === dayB ? (a.streak >= b.streak ? a : b) : (dayA > dayB ? a : b);

  // `todayScore` belongs to `todayScoreDate` and must not outlive it — yesterday's score
  // attached to today's date would be read as today's work.
  const sameScoreDay = a.todayScoreDate === b.todayScoreDate;
  const scoreFrom = sameScoreDay
    ? { todayScore: Math.max(a.todayScore, b.todayScore), todayScoreDate: a.todayScoreDate }
    : (a.todayScoreDate > b.todayScoreDate
      ? { todayScore: a.todayScore, todayScoreDate: a.todayScoreDate }
      : { todayScore: b.todayScore, todayScoreDate: b.todayScoreDate });

  const merged: SRSState = {
    streak: owner.streak,
    lastActive: owner.lastActive,
    ...scoreFrom,
    // Not owned by the streak: "when did you last OPEN it" is true of both devices, so the
    // later one is simply the more recent fact.
    lastVisit: laterDate(a.lastVisit, b.lastVisit) ?? '',
    sessions: Math.max(a.sessions ?? 0, b.sessions ?? 0),
    forgivenDays: unionDays(a.forgivenDays, b.forgivenDays),
    byLanguage: mergeByLanguage(a.byLanguage, b.byLanguage),
    accuracy: mergeAccuracy(a.accuracy, b.accuracy),
  };

  // Absent is meaningful for the optional fields — `useSRS` falls back when `lastActive` is
  // missing, and an empty object is not the same as one carrying empty defaults.
  if (merged.lastActive === undefined) delete merged.lastActive;
  if (merged.forgivenDays === undefined) delete merged.forgivenDays;
  if (merged.byLanguage === undefined) delete merged.byLanguage;
  if (merged.accuracy === undefined) delete merged.accuracy;
  if (a.sessions === undefined && b.sessions === undefined) delete merged.sessions;

  return merged;
}
