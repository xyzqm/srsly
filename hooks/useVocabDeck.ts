'use client';
import { useState, useEffect, useCallback } from 'react';
import type { DeckWord } from '@/lib/types';
import { storage } from '@/lib/storage';
import { fsrsSchedule, type FsrsGrade } from '@/lib/fsrs';

export function useVocabDeck() {
  const [deck, setDeck] = useState<DeckWord[]>([]);

  useEffect(() => {
    storage.getVocabDeck().then(setDeck);
  }, []);

  const addWord = useCallback(async (word: DeckWord) => {
    if (deck.some(d => d.h === word.h)) return;
    const next = [word, ...deck]; // prepend so newest words appear at the top
    setDeck(next);
    await storage.saveVocabDeck(next);
  }, [deck]);

  const removeWord = useCallback(async (idx: number) => {
    const word = deck[idx];
    const next = deck.filter((_, i) => i !== idx);
    setDeck(next);
    await storage.saveVocabDeck(next);
    // Also remove from claimedWords storage so PassageText's seed effect
    // doesn't re-add the vocab badge when the component remounts.
    if (word) {
      const c = await storage.getClaimedWords();
      const newVocab = c.vocab.filter(w => w !== word.h);
      if (newVocab.length !== c.vocab.length) {
        await storage.saveClaimedWords({ ...c, vocab: newVocab });
      }
    }
  }, [deck]);

  /**
   * Grade a flashcard review using FSRS.
   * grade: 1=Again, 2=Hard, 3=Good, 4=Easy
   */
  const updateWordReview = useCallback(async (hanzi: string, grade: number) => {
    const next = deck.map(d => {
      if (d.h !== hanzi) return d;
      const update = fsrsSchedule(d, grade as FsrsGrade);
      return { ...d, ...update };
    });
    setDeck(next);
    await storage.saveVocabDeck(next);
  }, [deck]);

  /** Update pinyin / meaning / other fields of the word at position idx. */
  const updateWord = useCallback(async (idx: number, update: Partial<DeckWord>) => {
    const next = deck.map((d, i) => i === idx ? { ...d, ...update } : d);
    setDeck(next);
    await storage.saveVocabDeck(next);
  }, [deck]);

  const clearDeck = useCallback(async () => {
    setDeck([]);
    await storage.saveVocabDeck([]);
    // Clear all vocab claims from storage so badges don't persist after clearing.
    const c = await storage.getClaimedWords();
    if (c.vocab.length > 0) {
      await storage.saveClaimedWords({ ...c, vocab: [] });
    }
  }, []);

  return { deck, addWord, removeWord, updateWordReview, updateWord, clearDeck };
}
