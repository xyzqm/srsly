/**
 * @vitest-environment jsdom
 *
 * jsdom because `SupabaseStorage` composes a `LocalStorage` that guards on `typeof window`,
 * and registers an `online` listener at construction.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseStorage } from '@/lib/storage/supabase';
import type { LanguageCode } from '@/lib/types';

/**
 * ONE PAGE LOAD MUST NOT BE FIFTY-TWO QUERIES.
 *
 * `row()` is `select('*')` — the whole row, every language's deck, the shelf and the
 * activity log — and every read path calls it fresh, deliberately, because that freshness is
 * what cross-device sync is. What was missing is that the reads on a page load are
 * CONCURRENT: four languages times several mounted copies of `useVocabDeck`, plus prefs, SRS
 * state, lessons, counts and cloze state, all mounting together.
 *
 * Measured on the live site before this: 52 Supabase calls, the last landing 25.9 seconds
 * after navigation, against a page that was itself interactive at 468ms.
 *
 * These pin the two halves that make sharing safe rather than merely fast: concurrent callers
 * share one fetch, and a caller arriving afterwards still gets its own.
 */

const LANGS: LanguageCode[] = ['zh', 'ja', 'es', 'fr'];

/** Counts round trips, and lets a test hold one open to make concurrency deterministic. */
function countingClient() {
  const state = { queries: 0, release: null as null | (() => void) };
  const sb = {
    from() {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              state.queries++;
              if (state.release) await new Promise<void>(r => { state.release = r; });
              return { data: { user_id: 'u', decks: {}, shelf: {} }, error: null };
            },
          }),
        }),
        upsert: async () => ({ error: null }),
      };
    },
  };
  return { sb: sb as never, state };
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('concurrent reads share one query', () => {
  it('collapses a page load’s worth of getters into a single round trip', async () => {
    const { sb, state } = countingClient();
    const store = new SupabaseStorage(sb, 'u');

    // Roughly what mounts at once: every language's deck and shelf, plus the singletons.
    await Promise.all([
      ...LANGS.map(l => store.getVocabDeck(l)),
      ...LANGS.map(l => store.getShelf(l)),
      store.getPrefs(),
      store.getSRSState(),
      store.getLessonsDone(),
      store.getActivityLog(),
    ]);

    expect(state.queries).toBe(1);
  });

  it('still fetches again for a caller that arrives after the first has landed', async () => {
    const { sb, state } = countingClient();
    const store = new SupabaseStorage(sb, 'u');

    await store.getPrefs();
    expect(state.queries).toBe(1);
    await store.getPrefs();
    // Freshness is the rule for reads — sharing is only ever with callers running RIGHT NOW.
    expect(state.queries).toBe(2);
  });
});
