'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { DeckWord, LanguageCode } from '@/lib/types';
import { storage } from '@/lib/storage';
import { dateInDays, todayStr } from '@/lib/deck';
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
  // Global: one card per (character + meaning). Decks are tags layered on top, so the
  // same word is never duplicated across decks — it just gains another tag.
  return w.h + '\u001f' + w.m.trim();
}

export function useVocabDeck(language: LanguageCode = 'zh') {
  const [deck, setDeck] = useState<DeckWord[]>([]);
  const [deckLoaded, setDeckLoaded] = useState(false);

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
    setDeckLoaded(false);
    storage.getVocabDeck(language).then(d => {
      let changed = false;
      const migrated = d.map(w => {
        let nw = w;
        // Backfill stable ids (pre multi-reading support).
        if (!nw.id) { changed = true; nw = { ...nw, id: genId() }; }
        // Migrate the legacy single `deck` string → `decks` tag array.
        const legacy = (nw as { deck?: string }).deck;
        if (legacy !== undefined) {
          changed = true;
          nw = { ...nw, decks: legacy ? [legacy] : (nw.decks ?? undefined) };
          delete (nw as { deck?: string }).deck;
        }
        return nw;
      });
      deckRef.current = migrated;
      setDeck(migrated);
      setDeckLoaded(true);
      if (changed) storage.saveVocabDeck(language, migrated);
    });
  }, [language]);

  // Merge a deck tag into a word's `decks`, returning a new array (or the same ref if
  // already present / no tag to add).
  function withDeckTag(w: DeckWord, deck?: string): DeckWord {
    if (!deck) return w;
    if (w.decks?.includes(deck)) return w;
    return { ...w, decks: [...(w.decks ?? []), deck] };
  }

  /**
   * Add one word. If a card with the same (character + meaning) already exists, it's not
   * duplicated — instead the target deck tag (if any) is merged into the existing card.
   */
  const addWord = useCallback(async (word: DeckWord) => {
    const cur = deckRef.current;
    const targetDeck = word.decks?.[0];
    const existing = cur.findIndex(d => identity(d) === identity(word));
    if (existing !== -1) {
      const merged = withDeckTag(cur[existing], targetDeck);
      if (merged === cur[existing]) return; // already present in this deck — nothing to do
      await commit(cur.map((d, i) => i === existing ? merged : d));
      return;
    }
    const withId = word.id ? word : { ...word, id: genId() };
    await commit([withId, ...cur]); // prepend so newest appears first
  }, [commit]);

  /**
   * Bulk add (import) into an optional target deck. Words that already exist (by character
   * + meaning) aren't duplicated — they just gain the target deck tag. Brand-new words are
   * created tagged with the target deck. Dedups within the batch. One atomic save. Returns
   * how many words were newly added OR newly tagged into the target deck.
   */
  const addWords = useCallback(async (words: DeckWord[], targetDeck?: string) => {
    const cur = deckRef.current;
    const byIdentity = new Map(cur.map((d, i) => [identity(d), i]));
    const next = cur.slice();
    const prepend: DeckWord[] = [];
    const batchSeen = new Set<string>();
    let count = 0;
    for (const w of words) {
      const key = identity(w);
      if (batchSeen.has(key)) continue;
      batchSeen.add(key);
      const at = byIdentity.get(key);
      if (at !== undefined) {
        const merged = withDeckTag(next[at], targetDeck);
        if (merged !== next[at]) { next[at] = merged; count++; } // gained the tag
        continue;
      }
      const decks = targetDeck ? [targetDeck] : undefined;
      prepend.push({ ...w, decks, id: w.id ?? genId() });
      count++;
    }
    if (count === 0) return 0;
    // Reverse the new cards so the batch keeps its original order once prepended newest-first.
    await commit([...prepend.reverse(), ...next]);
    return count;
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

  /** Add a deck tag to one word (no-op if already tagged / blank name). */
  const addWordToDeck = useCallback((id: string, name: string) => {
    const tag = name.trim();
    const w = deckRef.current.find(d => d.id === id);
    if (!tag || !w || w.decks?.includes(tag)) return Promise.resolve();
    return patchCard(id, { decks: [...(w.decks ?? []), tag] });
  }, [patchCard]);

  /** Remove a deck tag from one word (the card stays in your collection). */
  const removeWordFromDeck = useCallback((id: string, name: string) => {
    const w = deckRef.current.find(d => d.id === id);
    if (!w?.decks?.includes(name)) return Promise.resolve();
    const next = w.decks.filter(d => d !== name);
    return patchCard(id, { decks: next.length ? next : undefined });
  }, [patchCard]);

  /** Bulk: add a deck tag to many words at once ("add these to deck X"). */
  const addWordsToDeck = useCallback(async (ids: string[], name: string) => {
    const tag = name.trim();
    if (!tag) return;
    const set = new Set(ids);
    await commit(deckRef.current.map(d =>
      set.has(d.id!) && !d.decks?.includes(tag) ? { ...d, decks: [...(d.decks ?? []), tag] } : d,
    ));
  }, [commit]);

  /** Remove a deck tag from every word that has it (empties the deck; keeps the cards). */
  const clearWordsDeck = useCallback(async (name: string) => {
    await commit(deckRef.current.map(d => {
      if (!d.decks?.includes(name)) return d;
      const next = d.decks.filter(x => x !== name);
      return { ...d, decks: next.length ? next : undefined };
    }));
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
  const releaseFromPool = useCallback(async (count: number): Promise<number> => {
    const cur = deckRef.current;
    const today = todayStr();
    let released = 0;
    const next = cur.map(w => {
      if (!w.pool || released >= count) return w;
      released++;
      return { ...w, pool: undefined, dueAt: today }; // undefined drops from storage on save
    });
    if (released > 0) await commit(next);
    return released;
  }, [commit]);

  return {
    deck, deckLoaded, addWord, addWords, removeWord, gradeCard, updateWordReview, updateWord, clearDeck,
    toggleFocus, setPaused, snoozeWord, unsnoozeWord, rescheduleWord, resetProgress,
    addWordToDeck, removeWordFromDeck, addWordsToDeck,
    resumeAll, unsnoozeAll, unfocusAll, clearWordsDeck, releaseFromPool,
  };
}
