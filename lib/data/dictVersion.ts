/**
 * Cache-buster for the dictionary JSON under public/.
 *
 * These files are static assets, so a browser may hold an old copy indefinitely — and they
 * are no longer write-once: scripts/reorder-glosses.mjs re-ranks senses in place, and a
 * learner on a cached copy silently keeps the old definitions and any bug they carried.
 *
 * Bump on every change to public/*dict.json.
 */
export const DICT_VERSION = 3;
