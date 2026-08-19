import type { LanguageCode, UserPrefs } from './types';
import { todayStr } from './deck';
import { RECOMMENDED_POOL_ACTIVATE } from './fsrs';

/**
 * Bring one batch of pooled words into circulation, once a day, without being asked.
 *
 * LAZY, NOT SCHEDULED. There is no timer and nothing runs in the background: the app checks
 * a stored date when it loads and acts if that date is not today. A learner who opens the
 * app on Monday and again on Friday gets one batch on Monday and one on Friday, and nothing
 * happens on the days in between because nothing was running to make it happen.
 *
 * THE CATCH-UP CAP IS THE ABSENCE OF ARITHMETIC. It would be natural to multiply the batch
 * by the number of days missed — and that is exactly the avalanche this must not cause. Four
 * days away would hand back forty new cards on top of whatever is already due, on the day
 * someone is least likely to have time for it. So the elapsed gap is never measured: the
 * date is a boolean in disguise, "have we done this today", and the answer costs one batch
 * or nothing.
 *
 * The daily new-card budget (`srsNewPerDay`, enforced through lib/reviewCounts.ts) is a
 * second, independent floor under this. Activating ten cards does not introduce ten cards;
 * it makes them eligible, and the budget still decides how many are actually shown.
 */

/** Per language, because each has its own deck and its own pool. */
const key = (lang: LanguageCode) => `srsly-pool-auto-${lang}`;

/**
 * Guards against two callers racing on the same tick.
 *
 * The date check is idempotent only AFTER the date is written, and the write happens at the
 * end of an async release. Several `useVocabDeck` instances are alive at once — the Read and
 * Stats tabs are kept mounted — so an effect placed in that hook would fire from each of
 * them before any had recorded the day, and activate a batch per copy. This is why the call
 * site is AppShell, which mounts once; the set is the belt to that braces.
 */
const inFlight = new Set<LanguageCode>();

/** Whether the learner has switched this on. Off unless chosen — see the settings copy. */
export function autoActivateEnabled(prefs: UserPrefs): boolean {
  return prefs.autoActivatePool === true;
}

/** The date recorded for `lang`, or '' if it has never run. */
export function lastAutoActivation(lang: LanguageCode): string {
  if (typeof localStorage === 'undefined') return '';
  try { return localStorage.getItem(key(lang)) ?? ''; } catch { return ''; }
}

/**
 * Run the daily activation for `lang` if it has not run today.
 *
 * `release` is `useVocabDeck`'s `releaseFromPool`, passed in rather than imported: it is the
 * one function that knows how to pick the RIGHT words (curriculum order, not deck order) and
 * commit them, and going through it means the automatic path and the Activate button cannot
 * drift apart.
 *
 * Returns how many words were activated — 0 when it was already done today, when the feature
 * is off, or when the pool is empty.
 */
export async function runDailyPoolActivation(
  lang: LanguageCode,
  prefs: UserPrefs,
  release: (count: number) => Promise<string[]>,
): Promise<number> {
  if (!autoActivateEnabled(prefs)) return 0;
  if (typeof localStorage === 'undefined') return 0;

  const today = todayStr();
  if (lastAutoActivation(lang) === today) return 0;
  if (inFlight.has(lang)) return 0;

  inFlight.add(lang);
  try {
    const count = Math.max(1, prefs.poolActivateCount ?? RECOMMENDED_POOL_ACTIVATE);
    const released = await release(count);
    // Recorded even when the pool was empty and nothing moved. The date means "the check ran
    // today", not "words moved today" — otherwise an empty pool would re-run the whole thing
    // on every load, and the first word added would be activated the instant it arrived
    // rather than tomorrow.
    try { localStorage.setItem(key(lang), today); } catch { /* private mode */ }
    return released.length;
  } finally {
    inFlight.delete(lang);
  }
}
