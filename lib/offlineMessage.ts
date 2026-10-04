/**
 * What to tell a learner when a `fetch` did not come back — in words, not in an exception name.
 *
 * ── IT EXISTS BECAUSE THE SERVICE WORKER MADE THIS REACHABLE ──
 *
 * Before public/sw.js the app could not open without a connection, so "offline" was something
 * that happened mid-session at most. Now it opens, the deck is there, flashcards grade — and
 * every button that needs the server is one tap away from a failure that previously nobody
 * could get to. `components/read/PasteTextPanel.tsx` did
 * `setError(String(err instanceof Error ? err.message : err))`, so what the learner was shown
 * was literally `TypeError: Failed to fetch`.
 *
 * That is CLAUDE.md's most-repeated bug wearing a new face: a value meaning "there is no
 * network" rendered as a value meaning "something is broken". `hooks/useWordLookup.ts` already
 * draws the distinction correctly for its own case and says why — a distinct `'error'` status,
 * "deliberately NOT 'not-found': a network blip must not tell someone their word is made up."
 *
 * ── THREE BRANCHES, BECAUSE THERE ARE THREE DIFFERENT TRUTHS ──
 *
 *  1. `navigator.onLine === false` is the browser saying it has no connection at all. That is
 *     the only one of the three where "you're offline" is a fact rather than a guess.
 *  2. A `TypeError` out of `fetch` means the request never completed — DNS, a dropped
 *     connection, a blocked request. `onLine` can be `true` throughout: it reports a link, not
 *     reachability, which is why it is never trusted in the other direction.
 *  3. Anything else is a real answer from the server, and the server's own message is better
 *     than anything this function could invent. `daily-content` puts the actual reason on
 *     `detail` precisely so it can be shown.
 *
 * The `TypeError` test is deliberately second rather than first. A bug in the calling code can
 * also throw a `TypeError` inside the same `try`, and announcing that as a network problem
 * would hide it — so the unambiguous signal is checked before the inferred one.
 */
export function fetchFailureMessage(err: unknown, needs: string): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return `You're offline — ${needs} needs a connection.`;
  }
  if (err instanceof TypeError) {
    return `Couldn't reach the server — ${needs} needs a connection.`;
  }
  return err instanceof Error ? err.message : String(err);
}
