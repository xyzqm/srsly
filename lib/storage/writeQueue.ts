/**
 * Writes that did not reach the cloud, kept until they can.
 *
 * ── THE BUG THIS EXISTS FOR ──
 * `SupabaseStorage.patch` used to `console.error` a failed upsert and return. Nothing
 * retried. So grading cards with no signal wrote them to the device, failed to write them to
 * the cloud, and said nothing — and then the app's own refresh-on-focus (app/page.tsx) called
 * `invalidate()` and re-read, and every getter mirrored the cloud's OLDER copy back down over
 * local. The reviews were not delayed, they were deleted, by the feature that exists to keep
 * devices in step.
 *
 * ── IT IS A MAP, NOT A LOG, AND THAT IS THE WHOLE DESIGN ──
 * Every write in this layer is a WHOLE-COLUMN blob: `patch({ decks: <the entire decks
 * object> })`, never `{ add: word }`. So a later write for a column completely supersedes an
 * earlier one, and the queue only ever needs the most recent value per column.
 *
 * That single property removes almost everything hard about a retry queue. There is no
 * ordering to preserve, no risk of replaying a stale delta over a fresh one, and no unbounded
 * growth — the queue is bounded by the number of columns (eight), no matter how long the
 * device stays offline. An append-only log of operations would have needed all three problems
 * solved and would have been the obvious shape to reach for.
 *
 * ── KEYED BY USER ──
 * Two accounts can share a browser. A queue left behind by one must never replay into the
 * other's row, so the storage key carries the user id rather than being global.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──
 * It does not change the conflict model. Replaying a queued write overwrites whatever another
 * device did in the meantime, exactly as an online write already would — `prefs` and
 * `srs_state` have been whole-blob last-writer-wins since sync shipped, and CLAUDE.md says so.
 * Making offline writes merge properly needs per-field versioning and is a different project.
 * The claim here is narrower and worth stating exactly: **an offline write gets to be a
 * writer at all, instead of vanishing.**
 */

/** Column name → the most recent value that has not yet landed. */
export type PendingWrites = Record<string, unknown>;

export const QUEUE_KEY_PREFIX = 'srsly-write-queue-';

/**
 * How much serialized queue we are willing to keep.
 *
 * localStorage is ~5 MB for the WHOLE origin and already holds every deck, the shelf and the
 * daily cache. A queued deck plus shelf is easily hundreds of kB, so this can genuinely be
 * the write that tips the origin over — and a quota exception here would propagate out of a
 * save the learner is watching.
 *
 * When the cap is hit the queue is dropped rather than the local write being failed, and that
 * ordering is deliberate: local is written FIRST and is the truth. Dropping the queue costs
 * the sync of that change; failing the local write would cost the change itself.
 */
export const MAX_QUEUE_BYTES = 1_000_000;

function keyFor(userId: string): string {
  return QUEUE_KEY_PREFIX + userId;
}

/**
 * Fold a failed patch into the queue, replacing any earlier value for the same columns.
 *
 * Pure, and returns a new object rather than mutating, so a caller cannot accidentally
 * publish a half-updated queue.
 */
export function supersede(queue: PendingWrites, patch: Record<string, unknown>): PendingWrites {
  return { ...queue, ...patch };
}

/** Drop columns that have since landed. */
export function forget(queue: PendingWrites, columns: readonly string[]): PendingWrites {
  const drop = new Set(columns);
  return Object.fromEntries(Object.entries(queue).filter(([k]) => !drop.has(k)));
}

/**
 * Is a read of this column allowed to overwrite the local copy?
 *
 * This is the half of the fix that actually prevents the data loss. A queue alone does not:
 * the app can read, and mirror the stale cloud value down over local, before the queue ever
 * gets a chance to drain. While a column is pending, local is the newer copy by definition,
 * so the cloud must not be written over it.
 */
export function isPending(queue: PendingWrites, column: string): boolean {
  return Object.prototype.hasOwnProperty.call(queue, column);
}

export function isEmpty(queue: PendingWrites): boolean {
  return Object.keys(queue).length === 0;
}

/** Read a persisted queue. A corrupt or absent value is an empty queue, never a throw. */
export function load(userId: string): PendingWrites {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as PendingWrites;
  } catch {
    return {};   // a queue we cannot read is a queue we cannot replay; carry on
  }
}

/**
 * Persist the queue. Returns false when it could not be kept — too large, or the origin is
 * out of quota — so the caller can say so rather than believing a write is safely parked.
 */
export function save(userId: string, queue: PendingWrites): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    if (isEmpty(queue)) { localStorage.removeItem(keyFor(userId)); return true; }
    const raw = JSON.stringify(queue);
    // Measured in UTF-16 code units, which is what localStorage quotas actually count.
    if (raw.length > MAX_QUEUE_BYTES) return false;
    localStorage.setItem(keyFor(userId), raw);
    return true;
  } catch {
    return false;   // quota, or a private-mode origin that refuses writes
  }
}

/** Forget a user's queue entirely — on sign-out, or when it could not be persisted. */
export function drop(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(keyFor(userId)); } catch { /* nothing to do */ }
}
