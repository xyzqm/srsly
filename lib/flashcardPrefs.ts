/**
 * "Flip cards" (reverse study) preference for the Flashcards screen. Persisted in the
 * shared `srsly-prefs` blob and read synchronously (same pattern as getSrsSettings) so it
 * survives across days/sessions until the user toggles it off. Read-modify-write keeps the
 * other prefs intact.
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
