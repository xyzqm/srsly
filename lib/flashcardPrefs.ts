/**
 * Flashcard screen preferences: "Flip cards" (reverse study) and "Type answers".
 *
 * Both live in the shared `srsly-prefs` blob and are read synchronously (same pattern as
 * getSrsSettings) so they survive across days and sessions until toggled off. Read-modify-write
 * keeps the other prefs intact, and being in `srsly-prefs` means both SYNC — they are choices
 * about how to study, which mean the same thing on a phone as on a laptop, unlike the chosen
 * TTS voice that `lib/ttsVoice.ts` deliberately keeps device-local.
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
