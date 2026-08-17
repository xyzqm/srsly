/**
 * Constants shared across the client/server boundary.
 *
 * Only for values BOTH a browser component and an API route need to agree on. Anything used
 * on one side belongs with the code that uses it, and anything that varies by language
 * belongs on `LanguageConfig` — this is not a drawer for loose numbers.
 *
 * It exists because the alternative is a client component reaching into `lib/server/`. Next
 * does not forbid that (there is no `server/` convention in the framework, and `server-only`
 * is not installed here — the import built and ran fine), but the directory name is a promise
 * to the next reader that nothing inside ships to the browser, and one import of one constant
 * is enough to make that promise false. The modules under there pull in multi-megabyte
 * dictionaries; keeping the boundary literal is what stops one of them being bundled by
 * accident later.
 */

/**
 * Longest text the paste reader accepts, in characters.
 *
 * A cap rather than a stream: the whole passage is tokenised, held in React state and written
 * to localStorage, where it shares a ~5 MB budget with the deck, the day's generated content
 * and the shelf. 8,000 characters is a long newspaper feature — past that the honest answer
 * is to paste a section rather than to degrade quietly.
 *
 * Enforced server-side in app/api/segment-text/route.ts (a 413 with the real numbers); the
 * paste panel reads it only to draw a live counter and disable the button before you get there.
 */
export const MAX_PASTE_CHARS = 8000;
