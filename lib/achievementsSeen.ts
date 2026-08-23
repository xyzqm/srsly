/**
 * Which milestones have already been announced.
 *
 * This is the ONE piece of achievement state that cannot be derived. Whether a milestone is
 * earned is a function of the deck (see lib/achievements.ts); whether the learner has already
 * been *told* is not recoverable from anything.
 *
 * Device-local on purpose, like `srsly-curriculum-pruned`: it records what this copy of the
 * app has shown on this screen, not a preference worth syncing. Celebrating the same milestone
 * once on a laptop and once on a phone is a much smaller cost than the sync surface that would
 * prevent it.
 */

const KEY = 'srsly-achievements-seen';

export function loadSeen(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();   // corrupt value is not worth throwing over — re-announcing is harmless
  }
}

export function saveSeen(ids: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch { /* quota — the worst case is a milestone announced twice */ }
}

/**
 * Milestones earned but never announced.
 *
 * **Seeds silently on first run.** A learner who already has 400 words when this ships has
 * earned a dozen milestones, and opening the app to twelve toasts is a bug, not a reward.
 * `seed` marks everything currently earned as seen without announcing it, so only what is
 * earned FROM NOW ON is celebrated.
 */
export function unannounced(earnedIds: string[], seen: Set<string>): string[] {
  return earnedIds.filter(id => !seen.has(id));
}

export function seedIfFirstRun(earnedIds: string[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  if (localStorage.getItem(KEY) !== null) return false;
  saveSeen(new Set(earnedIds));
  return true;
}
