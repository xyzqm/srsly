/**
 * Flashcard screen preferences: "Flip cards" (reverse study) and "Type answers".
 *
 * Both live in the shared `srsly-prefs` blob and are read synchronously (same pattern as
 * getSrsSettings) so they survive across days and sessions until toggled off.
 *
 * ── THEY ARE FIELDS ON `UserPrefs`, AND THAT IS LOAD-BEARING ──
 * This file writes them by read-modify-write on localStorage, which keeps the OTHER keys in
 * the blob intact — but that only protects against this writer. `srsly-prefs` has a second
 * one: `getPrefs()` mirrors the cloud row down over local wholesale. While these were not
 * declared on `UserPrefs` they never travelled to the cloud, so that mirror wiped them on the
 * next read — and since `handleLanguageChange` calls `getPrefs()`, switching language silently
 * turned the toggle off. Declaring them is what makes the round trip preserve them.
 *
 * THE TWO ARE NOT INDEPENDENT. Typing pins the card's orientation per language
 * (`lib/typedAnswer.ts` explains why letting them combine corrupts FSRS), so the Flip toggle is
 * disabled while typing is on. They are still stored separately, so turning typing off restores
 * whichever flip setting the learner had chosen rather than silently resetting it.
 */
const KEY = 'srsly-prefs';

export function getReverseCards(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return !!JSON.parse(localStorage.getItem(KEY) ?? '{}').reverseCards;
  } catch {
    return false;
  }
}

export function setReverseCards(on: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const prefs = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    prefs.reverseCards = on;
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function getTypedRecall(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return !!JSON.parse(localStorage.getItem(KEY) ?? '{}').typedRecall;
  } catch {
    return false;
  }
}

export function setTypedRecall(on: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const prefs = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    prefs.typedRecall = on;
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
