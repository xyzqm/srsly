'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { DeckWord, LanguageCode } from '@/lib/types';
import { storage } from '@/lib/storage';
import { dateInDays, todayStr } from '@/lib/deck';
import { pruneDeckToCurriculum } from '@/lib/curriculum';
import { syncDeckGlosses } from '@/lib/deckGloss';
import { fsrsSchedule, getSrsSettings, LEECH_THRESHOLD, type FsrsGrade } from '@/lib/fsrs';

/**
 * Auto-flag a word as a leech once it has lapsed too many times (Anki's leech rule).
 * A leech is a card you keep forgetting; it eats review time, so we mark it and SUSPEND
 * (pause) it — nothing else. We deliberately do NOT star/focus it: suspend means pause,
 * and the card already surfaces under the Stuck filter via its `leech` flag.
 *
 * Threshold is LEECH_THRESHOLD (8). After the first flag, every half-threshold of
 * further lapses (12, 16, 20, …) re-suspends — so a card you keep failing re-pauses
 * even if you'd manually resumed it — but it is never re-flagged.
 */
function applyLeech(orig: DeckWord, patch: Partial<DeckWord>): Partial<DeckWord> {
  const prev = orig.lapses ?? 0;
  const now = patch.lapses ?? prev;
  if (now <= prev) return patch; // only on a fresh lapse, never on a pass
  // First time hitting the threshold (8): flag as a leech AND suspend (pause only).
  if (now >= LEECH_THRESHOLD && !orig.leech) {
    return { ...patch, leech: true, paused: true };
  }
  // Already a leech: every half-threshold after (12, 16, 20, …) just re-suspend (pause) —
  // no re-flag, no star.
  if (orig.leech && (now - LEECH_THRESHOLD) % (LEECH_THRESHOLD / 2) === 0) {
    return { ...patch, paused: true };
  }
  return patch;
}

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Dedup identity: same character + same meaning = the same card. A different meaning
// for the same character (行 "to walk" vs 行 "a row") is a distinct card, scheduled
// independently. Pinyin isn't used here because the dictionary returns one reading per
// character, so meaning is the reliable distinguisher for polyphones on import.
function identity(w: { h: string; m: string }): string {
  return w.h + '\u001f' + w.m.trim();
}

/** How much study a card is carrying, for deciding which of two copies to keep. */
function progress(w: DeckWord): number {
  return (w.reviews ?? 0) * 1e6 + (w.stability ?? 0) * 1e3 + (w.lapses ?? 0);
}

/**
 * Collapse cards that are the same card twice, and re-id any that still collide.
 *
 * addWord/addWords both dedup on the way in, so nothing should ever get here — but decks
 * arrive from four writers (localStorage, the Supabase row, the guest→cloud merge, and an
 * older build's format) and the Spanish deck came back holding `no` three times, same id and
 * same gloss. Identical ids are the worse half: React keys off `id`, so the duplicates were
 * also a "two children with the same key" error, and a patch by id would silently land on
 * whichever copy React had rendered.
 *
 * A semantic duplicate keeps the copy with the most study on it rather than the first one —
 * losing a card is recoverable, losing its review history is not. An id collision that is
 * NOT a semantic duplicate is a genuinely different card that happens to share an id, so it
 * is re-issued one instead of being dropped.
 *
 * Returns the original array when the deck was already clean, so the caller skips the write.
 */
function dedupeDeck(deck: DeckWord[]): DeckWord[] {
  const byWord = new Map<string, DeckWord>();
  for (const w of deck) {
    const key = identity(w);
    const prev = byWord.get(key);
    if (!prev || progress(w) > progress(prev)) byWord.set(key, w);
  }

  const ids = new Set<string>();
  let reissued = 0;
  const out = [...byWord.values()].map(w => {
    if (!w.id) return w;
    if (!ids.has(w.id)) { ids.add(w.id); return w; }
    reissued++;
    const id = genId();
    ids.add(id);
    return { ...w, id };
  });

  const dropped = deck.length - out.length;
  if (dropped === 0 && reissued === 0) return deck;
  console.info(`[deck] removed ${dropped} duplicate card(s)${reissued > 0 ? `, re-issued ${reissued} colliding id(s)` : ''}`);
  return out;
}

export function useVocabDeck(language: LanguageCode = 'zh') {
  const [deck, setDeck] = useState<DeckWord[]>([]);
  /**
   * Which language the deck in state actually belongs to — null until the first load.
   *
   * `deckLoaded` is derived from this DURING RENDER rather than flipped in an effect, and
   * that timing is the whole point. A `setDeckLoaded(false)` inside the language effect
   * lands too late: React runs child effects before the parent's, so on the first render
   * after a language switch a consumer still saw deckLoaded=true next to the outgoing
   * language's deck. Flashcards latches its queue in exactly that window, which is how a
   * Spanish card ended up on screen in a Japanese session.
   */
  const [loadedLang, setLoadedLang] = useState<LanguageCode | null>(null);
  const deckLoaded = loadedLang === language;

  // Mirror of deck that's always current — lets mutators compute from the latest
  // state even when several fire in one synchronous pass (e.g. ReadTab grading
  // multiple target words, or a bulk import) without losing updates to stale closures.
  const deckRef = useRef<DeckWord[]>([]);

  const commit = useCallback((next: DeckWord[]) => {
    deckRef.current = next;
    setDeck(next);
    return storage.saveVocabDeck(language, next);
  }, [language]);

  useEffect(() => {
    let live = true;
    storage.getVocabDeck(language).then(async d => {
      let changed = false;
      const migrated = d.map(w => {
        let nw = w;
        // Backfill stable ids (pre multi-reading support).
        if (!nw.id) { changed = true; nw = { ...nw, id: genId() }; }
        // Strip the retired multi-deck tags. srsly has one deck per language; the `deck`
        // string and the `decks` array that replaced it are both dead weight now, and
        // leaving them in localStorage would keep re-saving fields nothing reads.
        const stale = nw as { deck?: string; decks?: string[] };
        if (stale.deck !== undefined || stale.decks !== undefined) {
          changed = true;
          nw = { ...nw };
          delete (nw as { deck?: string }).deck;
          delete (nw as { decks?: string[] }).decks;
        }
        return nw;
      });
      // Before anything reads the deck by id: collapse cards that are in it twice.
      const unique = dedupeDeck(migrated);
      if (unique !== migrated) changed = true;
      // One-time removal of words that predate the current graded tables — see
      // lib/curriculum.ts. Runs before the deck is published to the UI so an
      // off-curriculum word never flashes into a review surface on the way out.
      const pruned = await pruneDeckToCurriculum(language, unique);
      if (pruned !== unique) changed = true;
      // Repair card definitions that describe the word's spelling rather than teaching it.
      // A card stores its own copy of the gloss, so improving the dictionary does nothing
      // for words already added — see lib/deckGloss.ts, which only touches glosses carrying
      // that fingerprint, never one the learner rewrote.
      const resynced = await syncDeckGlosses(language, pruned);
      if (resynced !== pruned) changed = true;
      // A switch away mid-load must not publish the language we just left.
      if (!live) return;
      deckRef.current = resynced;
      setDeck(resynced);
      setLoadedLang(language);
      if (changed) storage.saveVocabDeck(language, resynced);
    });
    return () => { live = false; };
  }, [language]);

  /** Add one word. A card with the same (character + meaning) already in the deck is left
   *  alone rather than duplicated. */
  const addWord = useCallback(async (word: DeckWord) => {
    const cur = deckRef.current;
    if (cur.some(d => identity(d) === identity(word))) return;
    const withId = word.id ? word : { ...word, id: genId() };
    await commit([withId, ...cur]); // prepend so newest appears first
  }, [commit]);

  /**
   * Bulk add (import). Words already in the deck (by character + meaning) are skipped
   * rather than duplicated, and duplicates within the batch collapse. One atomic save.
   * Returns how many words were newly added.
   */
  const addWords = useCallback(async (words: DeckWord[]) => {
    const cur = deckRef.current;
    const known = new Set(cur.map(identity));
    const prepend: DeckWord[] = [];
    for (const w of words) {
      const key = identity(w);
      if (known.has(key)) continue;
      known.add(key);
      prepend.push({ ...w, id: w.id ?? genId() });
    }
    if (prepend.length === 0) return 0;
    // Batch order is PRESERVED, and that matters well beyond cosmetics. A level import
    // arrives in curriculum order — `hola`, `adiós`, `hasta luego` first — and
    // releaseFromPool activates cards in array order. Reversing the batch here (which this
    // line used to do, for symmetry with addWord's newest-first prepend) meant "Activate 5"
    // handed out `precio`, `vía`, `necesidad`: the rarest tail of A1 instead of its easiest
    // opening. The batch still goes on top of older cards; only its internal order is kept.
    await commit([...prepend, ...cur]);
    return prepend.length;
  }, [commit]);

  const removeWord = useCallback(async (idx: number) => {
    const cur = deckRef.current;
    const word = cur[idx];
    const next = cur.filter((_, i) => i !== idx);
    await commit(next);
    // Only drop the passage-badge claim if no other reading of this character remains.
    if (word && !next.some(d => d.h === word.h)) {
      const c = await storage.getClaimedWords();
      const newVocab = c.vocab.filter(w => w !== word.h);
      if (newVocab.length !== c.vocab.length) {
        await storage.saveClaimedWords({ ...c, vocab: newVocab });
      }
    }
  }, [commit]);

  /**
   * Grade one specific card by its stable id — used by flashcards, where the exact
   * reading being reviewed is known, so each reading of a character schedules on its own.
   * grade: 1=Again, 2=Hard, 3=Good, 4=Easy
   */
  const gradeCard = useCallback(async (id: string, grade: number, opts?: { minDaysOut?: number }) => {
    const settings = getSrsSettings();
    const minDate = opts?.minDaysOut ? dateInDays(opts.minDaysOut) : undefined;
    const today = todayStr();
    let touched = false;
    const next = deckRef.current.map(d => {
      if (d.id !== id) return d;
      touched = true;
      const patch = applyLeech(d, fsrsSchedule(d, grade as FsrsGrade, settings, { fuzz: true }));
      if (minDate && patch.dueAt !== undefined && patch.dueAt <= today) {
        return { ...d, ...patch, dueAt: minDate, dueAtMs: undefined, phase: 'review' as const };
      }
      return { ...d, ...patch };
    });
    if (touched) await commit(next);
  }, [commit]);

  /**
   * Grade every reading of a character — used by passage/fill/conversation practice,
   * which works at the character level and can't tell which reading was meant.
   */
  const updateWordReview = useCallback(async (hanzi: string, grade: number, opts?: { minDaysOut?: number }) => {
    const settings = getSrsSettings();
    const minDate = opts?.minDaysOut ? dateInDays(opts.minDaysOut) : undefined;
    const today = todayStr();
    let touched = false;
    const next = deckRef.current.map(d => {
      if (d.h !== hanzi) return d;
      touched = true;
      const patch = applyLeech(d, fsrsSchedule(d, grade as FsrsGrade, settings, { fuzz: true }));
      if (minDate && patch.dueAt !== undefined && patch.dueAt <= today) {
        return { ...d, ...patch, dueAt: minDate, dueAtMs: undefined, phase: 'review' as const };
      }
      return { ...d, ...patch };
    });
    if (touched) await commit(next);
  }, [commit]);

  /** Update pinyin / meaning / other fields of the word at position idx. */
  const updateWord = useCallback(async (idx: number, update: Partial<DeckWord>) => {
    const next = deckRef.current.map((d, i) => i === idx ? { ...d, ...update } : d);
    await commit(next);
  }, [commit]);

  /** Patch a single card by stable id (used by the card-management actions). */
  const patchCard = useCallback(async (id: string, patch: Partial<DeckWord>) => {
    let touched = false;
    const next = deckRef.current.map(d => {
      if (d.id !== id) return d;
      touched = true;
      return { ...d, ...patch };
    });
    if (touched) await commit(next);
  }, [commit]);

  /** ★ Toggle a word's focus star. */
  const toggleFocus = useCallback((id: string) => {
    const w = deckRef.current.find(d => d.id === id);
    return patchCard(id, { focus: !w?.focus });
  }, [patchCard]);

  /** Pause / resume a word. Pausing clears any snooze (mutually exclusive). */
  const setPaused = useCallback((id: string, paused: boolean) =>
    patchCard(id, paused ? { paused: true, snoozeUntil: undefined } : { paused: false }),
  [patchCard]);

  /** Snooze a word until a date (default: tomorrow). Clears paused state. */
  const snoozeWord = useCallback((id: string, until?: string) =>
    patchCard(id, { snoozeUntil: until ?? dateInDays(1), paused: false }),
  [patchCard]);

  /** Cancel a snooze, returning the word to review. */
  const unsnoozeWord = useCallback((id: string) => patchCard(id, { snoozeUntil: undefined }), [patchCard]);

  /** Reschedule a word to become due on a specific date (YYYY-MM-DD). */
  const rescheduleWord = useCallback((id: string, dueAt: string) =>
    patchCard(id, { dueAt, dueAtMs: undefined, phase: 'review' }),
  [patchCard]);

  /** Bulk: resume every paused word. */
  const resumeAll = useCallback(async () => {
    await commit(deckRef.current.map(d => d.paused ? { ...d, paused: false } : d));
  }, [commit]);

  /** Bulk: un-snooze every currently-snoozed word. */
  const unsnoozeAll = useCallback(async () => {
    const today = todayStr();
    await commit(deckRef.current.map(d => (d.snoozeUntil && d.snoozeUntil > today) ? { ...d, snoozeUntil: undefined } : d));
  }, [commit]);

  /** Bulk: clear the focus star from every focused word. */
  const unfocusAll = useCallback(async () => {
    await commit(deckRef.current.map(d => d.focus ? { ...d, focus: false } : d));
  }, [commit]);

  /** Reset a word to "new": clears FSRS scheduling/history but keeps content + focus. */
  const resetProgress = useCallback((id: string) =>
    patchCard(id, {
      stability: undefined, difficulty: undefined, lapses: undefined, reviews: undefined,
      dueAt: undefined, lastReview: undefined, phase: undefined, learningStep: undefined, dueAtMs: undefined,
    }),
  [patchCard]);

  const clearDeck = useCallback(async () => {
    await commit([]);
    // Clear all vocab claims from storage so badges don't persist after clearing.
    const c = await storage.getClaimedWords();
    if (c.vocab.length > 0) {
      await storage.saveClaimedWords({ ...c, vocab: [] });
    }
  }, [commit]);

  /** Release the first `count` pool (staged) words into circulation (due today). Returns # released. */
  /**
   * Move the first `count` pooled cards into circulation, in deck order — which is
   * curriculum order, so a level import hands out its easiest words first.
   *
   * Returns the ids it released so the caller can offer an undo. Ids rather than a count:
   * undoing has to put back exactly those cards, and a second release in between would
   * make "the first N" mean something different by the time undo is pressed.
   */
  const releaseFromPool = useCallback(async (count: number): Promise<string[]> => {
    const cur = deckRef.current;
    const today = todayStr();
    const released: string[] = [];
    const next = cur.map(w => {
      if (!w.pool || released.length >= count) return w;
      released.push(w.id ?? w.h);
      return { ...w, pool: undefined, dueAt: today }; // undefined drops from storage on save
    });
    if (released.length > 0) await commit(next);
    return released;
  }, [commit]);

  /** Activate one specific pooled card. The per-card Release button used releaseFromPool(1),
   *  which activates the FIRST pooled card in deck order — so opening `zumo` and pressing
   *  Release quietly activated `hola` instead. */
  const releaseWord = useCallback(async (id: string) => {
    const today = todayStr();
    let touched = false;
    const next = deckRef.current.map(w => {
      if ((w.id ?? w.h) !== id || !w.pool) return w;
      touched = true;
      return { ...w, pool: undefined, dueAt: today };
    });
    if (touched) await commit(next);
  }, [commit]);

  /** Put specific cards back in the pool — the undo for releaseFromPool. */
  const restoreToPool = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const set = new Set(ids);
    await commit(deckRef.current.map(w =>
      set.has(w.id ?? w.h) ? { ...w, pool: true, dueAt: undefined } : w,
    ));
  }, [commit]);

  return {
    deck, deckLoaded, addWord, addWords, removeWord, gradeCard, updateWordReview, updateWord, clearDeck,
    toggleFocus, setPaused, snoozeWord, unsnoozeWord, rescheduleWord, resetProgress,
    resumeAll, unsnoozeAll, unfocusAll, releaseFromPool, restoreToPool, releaseWord,
  };
}
