/**
 * @vitest-environment jsdom
 *
 * jsdom because `SupabaseStorage` composes a `LocalStorage` that guards on `typeof window`,
 * and registers an `online` listener at construction.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseStorage } from '@/lib/storage/supabase';
import type { SRSState, UserPrefs } from '@/lib/types';

/**
 * That the storage layer actually USES the merges, not merely that they exist.
 *
 * `tests/srsStateMerge.test.ts` and `tests/prefsMerge.test.ts` pin the pure functions. These
 * pin the wiring, which is the half that can silently regress: `savePrefs` and `saveSRSState`
 * were one-liners that sent the blob straight through, and a future edit could make them one
 * again without touching a merge test. What is asserted here is the PAYLOAD — what actually
 * goes to the database — because that is what the other device reads.
 */

/** Records upsert payloads and serves a fixed row, standing in for another device's writes. */
function fakeClient(row: Record<string, unknown> | null) {
  const upserts: Record<string, unknown>[] = [];
  const sb = {
    from() {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
        upsert: async (payload: Record<string, unknown>) => { upserts.push(payload); return { error: null }; },
      };
    },
  };
  return { sb: sb as never, upserts };
}

const srs = (o: Partial<SRSState> = {}): SRSState => ({
  streak: 0, lastVisit: '2026-09-01', todayScore: -1, todayScoreDate: '2026-09-01', ...o,
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('saveSRSState sends a merge, not the local blob', () => {
  /**
   * THE BUG. The laptop studied today and its streak is 10. This device last studied days
   * ago and still believes 9. Before the merge, saving anything here wrote 9 to the cloud and
   * the learner watched their streak go backwards.
   */
  it('does not send a stale streak over a newer one', async () => {
    const { sb, upserts } = fakeClient({
      user_id: 'u',
      srs_state: srs({ streak: 10, lastActive: '2026-09-05' }),
    });
    const store = new SupabaseStorage(sb, 'u');

    await store.saveSRSState(srs({ streak: 9, lastActive: '2026-09-01' }));

    const sent = upserts.at(-1)!.srs_state as SRSState;
    expect(sent.streak).toBe(10);
    expect(sent.lastActive).toBe('2026-09-05');
  });

  /** And a streak that genuinely grew here still reaches the cloud. */
  it('sends a streak this device really did advance', async () => {
    const { sb, upserts } = fakeClient({
      user_id: 'u',
      srs_state: srs({ streak: 9, lastActive: '2026-09-04' }),
    });
    const store = new SupabaseStorage(sb, 'u');

    await store.saveSRSState(srs({ streak: 10, lastActive: '2026-09-05' }));

    expect((upserts.at(-1)!.srs_state as SRSState).streak).toBe(10);
  });
});

describe('savePrefs sends a three-way merge', () => {
  /**
   * THE BUG, in the field the report named: change the theme on one device and the other
   * device's level went back. `getPrefs()` first, because reading the cloud is what
   * establishes the merge base — which is exactly the sequence the app performs on load.
   */
  it('changing the theme here does not revert a level set elsewhere', async () => {
    // What both devices last agreed on.
    const { sb } = fakeClient({
      user_id: 'u',
      prefs: { theme: 'paper', font: 'editorial-warm', hskLevel: 3 } as UserPrefs,
    });
    const store = new SupabaseStorage(sb, 'u');
    await store.getPrefs();                       // base = { paper, 3 }

    // Meanwhile the laptop raised the level to 5. Re-point the fake row at that.
    const later = fakeClient({
      user_id: 'u',
      prefs: { theme: 'paper', font: 'editorial-warm', hskLevel: 5 } as UserPrefs,
    });
    // Swap in the newer row while keeping the same store (its base is already set).
    (store as unknown as { sb: unknown }).sb = later.sb;
    (store as unknown as { fetchedAt: number }).fetchedAt = 0;

    // This device changes only the theme.
    await store.savePrefs({ theme: 'ink', font: 'editorial-warm', hskLevel: 3 } as UserPrefs);

    const sent = later.upserts.at(-1)!.prefs as UserPrefs;
    expect(sent.theme).toBe('ink');     // what this device changed
    expect(sent.hskLevel).toBe(5);      // what it did NOT change, kept from the cloud
  });

  it('keeps a tested level from either device', async () => {
    const { sb, upserts } = fakeClient({
      user_id: 'u',
      prefs: { theme: 'paper', font: 'editorial-warm', testedLevels: { es: 2 } } as UserPrefs,
    });
    const store = new SupabaseStorage(sb, 'u');

    await store.savePrefs({
      theme: 'paper', font: 'editorial-warm', testedLevels: { zh: 4 },
    } as UserPrefs);

    expect((upserts.at(-1)!.prefs as UserPrefs).testedLevels).toEqual({ zh: 4, es: 2 });
  });
});
