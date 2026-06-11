'use client';
import { useState, useEffect, useCallback } from 'react';
import type { DeckWord } from '@/lib/types';
import { storage } from '@/lib/storage';

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
    const next = deck.filter((_, i) => i !== idx);
    setDeck(next);
    await storage.saveVocabDeck(next);
  }, [deck]);

  const updateWordReview = useCallback(async (hanzi: string, delta: number) => {
    const next = deck.map(d =>
      d.h === hanzi ? { ...d, reviews: Math.max(0, (d.reviews ?? 0) + delta) } : d
    );
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
  }, []);

  return { deck, addWord, removeWord, updateWordReview, updateWord, clearDeck };
}
