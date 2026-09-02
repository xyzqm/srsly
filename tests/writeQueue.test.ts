import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  supersede, forget, isPending, isEmpty, load, save, drop,
  MAX_QUEUE_BYTES, QUEUE_KEY_PREFIX,
} from '@/lib/storage/writeQueue';

/**
 * The offline write queue.
 *
 * ── WHAT THIS IS PROTECTING ──
 * `SupabaseStorage.patch` used to `console.error` a failed upsert and return, so reviews
 * graded without signal were written to the device and never to the cloud — and then the
 * app's own refresh-on-focus re-read and mirrored the cloud's OLDER copy back down over
 * local. The reviews were deleted, by the feature that exists to keep devices in step.
 *
 * Everything here is pure or localStorage-only, which is exactly the shape this repo's suite
 * covers. The end-to-end behaviour — go offline, grade, come back — is verified by hand,
 * because no unit test can prove a network layer reconnects.
 */

/** A minimal localStorage, so `save`/`load` can be exercised in a node environment. */
function installStorage(overrides: Partial<Storage> = {}) {
  const data = new Map<string, string>();
  const store = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
    ...overrides,
  } as Storage;
  vi.stubGlobal('localStorage', store);
  return data;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the queue supersedes rather than accumulating', () => {
  /**
   * THE PROPERTY THE WHOLE DESIGN RESTS ON. Every write in this layer is a WHOLE-COLUMN blob,
   * so a later value for a column replaces an earlier one completely. That is what bounds the
   * queue at the number of columns however long the device stays offline, and what removes
   * any need to preserve ordering.
   */
  it('keeps only the most recent value for a column', () => {
    let q = supersede({}, { decks: { zh: ['old'] } });
    q = supersede(q, { decks: { zh: ['new'] } });
    expect(Object.keys(q)).toEqual(['decks']);
    expect(q.decks).toEqual({ zh: ['new'] });
  });

  it('stays bounded by the column count, not by how many writes failed', () => {
    let q = {};
    for (let i = 0; i < 500; i++) {
      q = supersede(q, { decks: { n: i }, activity_log: [{ d: '2026-09-01', n: i }] });
    }
    expect(Object.keys(q).sort()).toEqual(['activity_log', 'decks']);
  });

  it('carries independent columns side by side', () => {
    const q = supersede(supersede({}, { decks: 1 }), { prefs: 2 });
    expect(q).toEqual({ decks: 1, prefs: 2 });
  });

  it('does not mutate the queue it was given', () => {
    const before = { decks: 1 };
    const after = supersede(before, { prefs: 2 });
    expect(before).toEqual({ decks: 1 });
    expect(after).not.toBe(before);
  });
});

describe('landing a write clears it', () => {
  it('forgets only the columns named', () => {
    const q = forget({ decks: 1, prefs: 2, shelf: 3 }, ['decks', 'shelf']);
    expect(q).toEqual({ prefs: 2 });
  });

  it('is a no-op for a column that was never queued', () => {
    expect(forget({ decks: 1 }, ['prefs'])).toEqual({ decks: 1 });
  });

  it('empties cleanly', () => {
    expect(isEmpty(forget({ decks: 1 }, ['decks']))).toBe(true);
  });
});

describe('isPending is what stops a read overwriting local', () => {
  /**
   * The queue alone does not prevent the data loss. The app can read — and mirror the stale
   * cloud value down over local — before the queue ever drains. While a column is pending,
   * local is by definition the newer copy.
   */
  it('reports a queued column as pending', () => {
    expect(isPending({ decks: 1 }, 'decks')).toBe(true);
    expect(isPending({ decks: 1 }, 'prefs')).toBe(false);
    expect(isPending({}, 'decks')).toBe(false);
  });

  /** A column whose queued value is legitimately `undefined` is still pending. */
  it('uses key presence, not truthiness', () => {
    expect(isPending({ prefs: undefined }, 'prefs')).toBe(true);
    expect(isPending({ prefs: null }, 'prefs')).toBe(true);
    expect(isPending({ prefs: 0 }, 'prefs')).toBe(true);
  });

  /** `{}` inherits `toString` from Object.prototype; a naive `in` check would say yes. */
  it('is not fooled by inherited properties', () => {
    expect(isPending({}, 'toString')).toBe(false);
    expect(isPending({}, 'constructor')).toBe(false);
  });
});

describe('persistence survives closing the app', () => {
  beforeEach(() => { installStorage(); });

  it('round-trips a queue', () => {
    const q = { decks: { zh: [{ h: '猫' }] }, prefs: { theme: 'ink' } };
    expect(save('user-1', q)).toBe(true);
    expect(load('user-1')).toEqual(q);
  });

  /** Two accounts can share a browser; one's queue must never replay into the other's row. */
  it('keys by user, so one account cannot replay into another', () => {
    save('user-1', { decks: 'a' });
    save('user-2', { decks: 'b' });
    expect(load('user-1')).toEqual({ decks: 'a' });
    expect(load('user-2')).toEqual({ decks: 'b' });
  });

  it('removes the key entirely when the queue empties', () => {
    const data = installStorage();
    save('user-1', { decks: 1 });
    expect(data.has(QUEUE_KEY_PREFIX + 'user-1')).toBe(true);
    save('user-1', {});
    expect(data.has(QUEUE_KEY_PREFIX + 'user-1')).toBe(false);
  });

  it('reads an absent queue as empty', () => {
    expect(load('nobody')).toEqual({});
  });

  /** A queue we cannot parse is a queue we cannot replay — carry on rather than throwing
   *  inside a save the learner is watching. */
  it('reads corrupt or wrongly-shaped values as empty rather than throwing', () => {
    const data = installStorage();
    for (const bad of ['{not json', '[1,2,3]', 'null', '"a string"', '42']) {
      data.set(QUEUE_KEY_PREFIX + 'u', bad);
      expect(load('u')).toEqual({});
    }
  });

  it('drops a queue on request', () => {
    save('user-1', { decks: 1 });
    drop('user-1');
    expect(load('user-1')).toEqual({});
  });
});

describe('the quota guard fails safe', () => {
  /**
   * localStorage is ~5 MB for the whole origin and already holds every deck. When the queue
   * cannot be kept, the SYNC of that change is lost and never the change itself — local is
   * written first and is the truth. `save` reports false so the caller can say so out loud,
   * which is the one thing the original bug did not do.
   */
  it('refuses a queue larger than the cap', () => {
    installStorage();
    const huge = { decks: 'x'.repeat(MAX_QUEUE_BYTES + 1) };
    expect(save('user-1', huge)).toBe(false);
    expect(load('user-1')).toEqual({});
  });

  it('reports false when the browser refuses the write', () => {
    installStorage({ setItem: () => { throw new Error('QuotaExceededError'); } });
    expect(save('user-1', { decks: 1 })).toBe(false);
  });

  it('accepts a queue just under the cap', () => {
    installStorage();
    // JSON overhead means the payload must be a little under the raw cap.
    expect(save('user-1', { decks: 'x'.repeat(MAX_QUEUE_BYTES - 100) })).toBe(true);
  });
});

describe('with no localStorage at all', () => {
  /** Server-side rendering, and private modes that remove the API outright. */
  it('degrades to an empty queue rather than throwing', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(load('user-1')).toEqual({});
    expect(save('user-1', { decks: 1 })).toBe(false);
    expect(() => drop('user-1')).not.toThrow();
  });
});
