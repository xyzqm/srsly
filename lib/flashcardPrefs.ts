import { storage } from './storage';
import type { UserPrefs } from './types';

/**
 * Flashcard screen preferences: "Flip cards" (reverse study) and "Type answers".
 *
 * Both live in the shared `srsly-prefs` blob. They are READ synchronously off localStorage
 * (the same pattern as `getSrsSettings`) so the toggle paints correctly on the first frame,
 * and WRITTEN through `storage.savePrefs` so the value actually reaches the cloud.
 *
 * ── THAT SPLIT IS THE WHOLE FIX, AND THE FIRST ATTEMPT MISSED IT ──
 * These were declared on `UserPrefs` to make them sync, and they still did not: a TYPE is
 * erased at runtime, and nothing on the write path had changed. `setTypedRecall` wrote
 * straight to localStorage and stopped there, so the field never once reached the row.
 * `SupabaseStorage.getPrefs()` then mirrors the cloud's prefs down over local WHOLESALE —
 * and `app/page.tsx` calls it on every language change, for the daily pool activation. So
 * the sequence was: toggle on (local only) → switch language → getPrefs() → local blob
 * replaced by a cloud copy that has never heard of `typedRecall` → toggle off. Declaring the
 * field made the round trip able to preserve it; sending it is what makes the round trip
 * happen.
 *
 * Signed OUT this bug is invisible, because `LocalStorage.getPrefs` reads back the same blob
 * it just wrote. It only appears on the live site, signed in, which is exactly where it was
 * reported and exactly why it survived a fix.
 *
 * The local write stays FIRST and synchronous: `getTypedRecall` is called from an effect on
 * the very next tick, and waiting on a network round trip to know the state of a toggle the
 * learner just pressed would flicker it. The cloud write is fire-and-forget behind it, and
 * `mergePrefs` applies only the field that differs from this device's base — so pushing the
 * toggle cannot revert a level or a theme set on another device.
 *
 * THE TWO ARE NOT INDEPENDENT. Typing pins the card's orientation per language
 * (`lib/typedAnswer.ts` explains why letting them combine corrupts FSRS), so the Flip toggle is
 * disabled while typing is on. They are still stored separately, so turning typing off restores
 * whichever flip setting the learner had chosen rather than silently resetting it.
 */
const KEY = 'srsly-prefs';

function readBlob(): Record<string, unknown> {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Write one field, locally now and to the cloud behind it.
 *
 * The cloud write is deliberately not awaited and its failure is swallowed: local is the
 * truth for this device, and a toggle that throws because the network is down would be a
 * worse bug than one that syncs late. `writeQueue` already retries a failed patch.
 */
function writeField(field: 'reverseCards' | 'typedRecall', on: boolean): void {
  if (typeof localStorage === 'undefined') return;
  const prefs = readBlob();
  prefs[field] = on;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* quota — the cloud write below is still worth attempting */
  }
  /**
   * Cast rather than filled in. `UserPrefs` requires `theme` and `font`, and the stored blob
   * may genuinely lack them on a fresh account — but supplying defaults here would be a real
   * bug, not a formality: `mergePrefs` applies every field where `mine` differs from this
   * device's base, so injecting `theme: 'paper'` would push it to the cloud and revert a
   * theme chosen on another device. What is on disk is the honest value, absences included.
   */
  void storage.savePrefs(prefs as unknown as UserPrefs).catch(() => {});
}

export function getReverseCards(): boolean {
  return !!readBlob().reverseCards;
}

export function setReverseCards(on: boolean): void {
  writeField('reverseCards', on);
}

export function getTypedRecall(): boolean {
  return !!readBlob().typedRecall;
}

export function setTypedRecall(on: boolean): void {
  writeField('typedRecall', on);
}
