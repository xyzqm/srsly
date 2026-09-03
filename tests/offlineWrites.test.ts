/**
 * @vitest-environment jsdom
 *
 * jsdom, not node, and for a specific reason: `LocalStorage` guards every read and write on
 * `typeof window === 'undefined'`, so under the default node environment it is a silent
 * no-op and these tests would pass while proving nothing. `SupabaseStorage` also registers an
 * `online` listener on `window`, which is half of what is under test here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SupabaseStorage, migrateLocalToCloud } from '@/lib/storage/supabase';
import { LocalStorage } from '@/lib/storage/local';
import type { DeckWord, LanguageCode } from '@/lib/types';

/**
 * Grading cards with no signal, and what happens when the signal comes back.
 *
 * These drive the real `SupabaseStorage` against a fake client, because the two bugs being
 * pinned are both about the INTERACTION between a failed write and the next read — neither is
 * visible in a pure function, and both were invisible in the browser that caused them.
 *
 *   1. A failed write vanished. `patch` logged to the console and returned, so the reviews
 *      lived only on the device — and then the app's own refresh-on-focus re-read and
 *      mirrored the cloud's OLDER copy back down over local. Deleted, not delayed.
 *
 *   2. A failed write was built WRONG. Every column payload is assembled by spreading the
 *      cloud's current value, `{ ...(r?.decks ?? {}), [lang]: deck }`. Offline, `row()`
 *      returns null, so that `?? {}` produced an object holding only the language being
 *      studied. It failed harmlessly at the time, which is what hid it — queue that write and
 *      replay it and the other three languages' decks are gone.
 */

const word = (h: string): DeckWord => ({ h, p: '', m: h });

/**
 * A stand-in for the Supabase client.
 *
 * `online` decides whether reads and writes succeed, which is the only axis these tests care
 * about. `upserts` records what was actually sent — the payload is the thing under test.
 */
function fakeClient(state: { online: boolean; row: Record<string, unknown> | null }) {
  const upserts: Record<string, unknown>[] = [];
  const sb = {
    from() {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => (state.online
              ? { data: state.row, error: null }
              : { data: null, error: { message: 'Failed to fetch' } }),
          }),
        }),
        upsert: async (payload: Record<string, unknown>) => {
          if (!state.online) return { error: { message: 'Failed to fetch' } };
          upserts.push(payload);
          return { error: null };
        },
      };
    },
  };
  // The real client's type is far wider than the four methods this file touches.
  return { sb: sb as never, upserts };
}

const LANGS: LanguageCode[] = ['zh', 'ja', 'es', 'fr'];

beforeEach(() => {
  // jsdom keeps one localStorage for the whole file, so state must be cleared per test or a
  // deck seeded in one leaks into the next.
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('a write made offline is not lost', () => {
  it('survives the read that used to overwrite it', async () => {
    const local = new LocalStorage();
    await local.saveVocabDeck('zh', [word('旧')]);

    // The cloud holds an older deck — the one that used to come back and win.
    const state = { online: false, row: { decks: { zh: [word('旧')] } } as Record<string, unknown> };
    const { sb } = fakeClient(state);
    const store = new SupabaseStorage(sb, 'user-1');

    // Offline: grade a card. Local takes it; the cloud write fails and is queued.
    await store.saveVocabDeck('zh', [word('旧'), word('新')]);
    expect((await local.getVocabDeck('zh')).map(w => w.h)).toEqual(['旧', '新']);

    // Back online, but BEFORE the queue drains — this is the exact moment the app's
    // refresh-on-focus used to destroy the work.
    state.online = true;
    store.invalidate();
    const read = await store.getVocabDeck('zh');

    expect(read.map(w => w.h), 'the stale cloud deck overwrote the offline work').toEqual(['旧', '新']);
    expect((await local.getVocabDeck('zh')).map(w => w.h)).toEqual(['旧', '新']);
  });

  it('reaches the cloud once the connection returns', async () => {
    const state = { online: false, row: null as Record<string, unknown> | null };
    const { sb, upserts } = fakeClient(state);
    const store = new SupabaseStorage(sb, 'user-1');

    await store.saveVocabDeck('zh', [word('新')]);
    expect(upserts, 'nothing should have landed while offline').toHaveLength(0);

    state.online = true;
    await store.flush();

    expect(upserts).toHaveLength(1);
    expect((upserts[0].decks as Record<string, DeckWord[]>).zh.map(w => w.h)).toEqual(['新']);
  });

  it('stops guarding the read once the write has landed', async () => {
    const state = { online: false, row: { decks: { zh: [word('雲')] } } as Record<string, unknown> };
    const { sb } = fakeClient(state);
    const store = new SupabaseStorage(sb, 'user-1');

    await store.saveVocabDeck('zh', [word('地')]);
    state.online = true;
    await store.flush();

    // With nothing pending, the cloud is authoritative again — that is what sync IS, and a
    // guard that never lifted would break the feature in the other direction.
    store.invalidate();
    expect((await store.getVocabDeck('zh')).map(w => w.h)).toEqual(['雲']);
  });
});

describe('an offline write does not delete the other languages', () => {
  /**
   * THE DESTRUCTIVE ONE. With a cold cache and no connection, the merge base used to be `{}`,
   * so the payload named only the language in front of the learner. Replaying it wiped the
   * rest — a bug caused BY going offline, and strictly worse than the one the queue fixes.
   */
  it('builds its payload from local when the cloud row is unreachable', async () => {
    const local = new LocalStorage();
    for (const l of LANGS) await local.saveVocabDeck(l, [word(`${l}-word`)]);

    const state = { online: false, row: null as Record<string, unknown> | null };
    const { sb, upserts } = fakeClient(state);
    const store = new SupabaseStorage(sb, 'user-1');

    await store.saveVocabDeck('zh', [word('新')]);
    state.online = true;
    await store.flush();

    const sent = upserts[0].decks as Record<string, DeckWord[]>;
    expect(Object.keys(sent).sort(), 'the other languages were dropped from the payload')
      .toEqual([...LANGS].sort());
    expect(sent.zh.map(w => w.h)).toEqual(['新']);
    expect(sent.ja.map(w => w.h)).toEqual(['ja-word']);
  });

  it('still prefers the cloud row as the merge base when it can be read', async () => {
    const local = new LocalStorage();
    await local.saveVocabDeck('ja', [word('stale-local')]);

    const state = {
      online: true,
      row: { decks: { ja: [word('fresh-cloud')] } } as Record<string, unknown>,
    };
    const { sb, upserts } = fakeClient(state);
    const store = new SupabaseStorage(sb, 'user-1');

    await store.saveVocabDeck('zh', [word('新')]);

    const sent = upserts[0].decks as Record<string, DeckWord[]>;
    expect(sent.ja.map(w => w.h), 'local should not have shadowed a readable cloud row')
      .toEqual(['fresh-cloud']);
  });
});

describe('a schema fault is not treated as a network fault', () => {
  /**
   * A missing column will never succeed, so queueing it would mean retrying forever on every
   * focus. It is learned once and dropped — the behaviour that already existed, kept intact
   * now that a retry path sits next to it.
   */
  it('does not queue a write the database cannot accept', async () => {
    const upserts: Record<string, unknown>[] = [];
    const sb = {
      from() {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          upsert: async (payload: Record<string, unknown>) => {
            if ('lessons_done' in payload) {
              return { error: { message: "Could not find the 'lessons_done' column of 'user_data' in the schema cache" } };
            }
            upserts.push(payload);
            return { error: null };
          },
        };
      },
    };
    const store = new SupabaseStorage(sb as never, 'user-1');

    await store.saveLessonsDone(['fr-gender']);
    // Nothing queued, so a flush has nothing to send and cannot loop.
    await store.flush();
    expect(upserts).toHaveLength(0);
    expect(localStorage.getItem('srsly-write-queue-user-1')).toBeNull();
  });
});

describe('the sign-in migration does not rewrite an unchanged row', () => {
  /**
   * It runs on EVERY page load, not only the first sign-in, and AuthProvider blocks the whole
   * UI behind it — the app is a bare "loading…" until it resolves. It used to upsert all six
   * columns unconditionally, so a returning learner waited on a full-row write of their deck,
   * shelf, activity log and lesson list before seeing a single frame.
   *
   * Tested by running it TWICE against its own output rather than against a hand-built row:
   * a fixture invites the fixture to be wrong, and what actually matters is that the second
   * load of a real session is free.
   */
  it('writes on the first run and sends nothing on the second', async () => {
    const local = new LocalStorage();
    await local.saveVocabDeck('zh', [word('猫')]);

    const state = { online: true, row: null as Record<string, unknown> | null };
    const { sb, upserts } = fakeClient(state);

    await migrateLocalToCloud(sb, 'user-1');
    expect(upserts, 'the first sign-in must carry local data up').toHaveLength(1);

    // The cloud now holds exactly what the migration produced — a returning learner's row.
    state.row = { ...upserts[0] };
    await migrateLocalToCloud(sb, 'user-1');
    expect(upserts, 'a second load should cost one SELECT and no writes').toHaveLength(1);
  });

  /**
   * Key ORDER is the trap. Postgres does not promise to hand JSONB back in the order it was
   * given, so a plain JSON.stringify comparison would call every column changed on every load
   * and silently restore the behaviour this removes.
   */
  it('is not fooled by JSONB key reordering', async () => {
    const local = new LocalStorage();
    await local.saveVocabDeck('zh', [{ h: '猫', p: 'māo', m: 'cat' }]);

    const state = { online: true, row: null as Record<string, unknown> | null };
    const { sb, upserts } = fakeClient(state);
    await migrateLocalToCloud(sb, 'user-1');

    // Round-trip the row through a key-reversing pass, as a JSONB column may.
    const reorder = (v: unknown): unknown =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse().map(([k, x]) => [k, reorder(x)]))
        : Array.isArray(v) ? v.map(reorder) : v;
    state.row = reorder({ ...upserts[0] }) as Record<string, unknown>;

    await migrateLocalToCloud(sb, 'user-1');
    expect(upserts, 'key order alone was treated as a change').toHaveLength(1);
  });

  /**
   * The skip must not swallow a real change. Note this uses the ACTIVITY LOG rather than the
   * deck, and the reason is a contract worth knowing: once the cloud holds any deck,
   * `anyCloudDeck` makes the cloud authoritative and this function deliberately stops
   * carrying local deck edits up — that is what makes deletions propagate, and deck changes
   * travel by `saveVocabDeck` instead. The log, the shelf and the lesson list are the things
   * it still merges on every load.
   */
  it('still writes a column that genuinely differs', async () => {
    const local = new LocalStorage();
    await local.saveVocabDeck('zh', [word('猫')]);

    const state = { online: true, row: null as Record<string, unknown> | null };
    const { sb, upserts } = fakeClient(state);
    await migrateLocalToCloud(sb, 'user-1');
    state.row = { ...upserts[0] };

    // A day of study recorded on this device since the last sync.
    await local.saveActivityLog([{ d: '2026-09-02', n: 12 }]);
    await migrateLocalToCloud(sb, 'user-1');

    expect(upserts).toHaveLength(2);
    expect(Object.keys(upserts[1])).toContain('activity_log');
  });
});
