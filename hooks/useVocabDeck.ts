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
    const next = [...deck, word];
    setDeck(next);
    await storage.saveVocabDeck(next);
  }, [deck]);

  const removeWord = useCallback(async (idx: number) => {
    const next = deck.filter((_, i) => i !== idx);
    setDeck(next);
    await storage.saveVocabDeck(next);
  }, [deck]);

  return { deck, addWord, removeWord };
}
