'use client';
import { useState, useCallback, useEffect } from 'react';
import type { PassageToken } from '@/lib/types';
import type { PopupData } from '@/components/read/WordPopup';
import { lookupWord } from '@/lib/data/dict';
import { storage } from '@/lib/storage';

/**
 * Shared hook for word-definition popups.
 *
 * @param onAddVocab  Called when the user clicks "Add to vocab".
 * @param deckWords   Optional live set of words currently in the user's deck.
 *                    When provided, a stale 'vocab' claim for a word that was
 *                    removed from the deck is treated as unclaimed — so the
 *                    "Add to vocab" / "Learn this word" buttons re-appear.
 */
export function useWordPopup(
  onAddVocab?: (word: string, pinyin: string, meaning: string) => void,
  deckWords?: Set<string>,
) {
  const [popup, setPopup] = useState<PopupData | null>(null);

  // Track vocab and tomorrow claims separately so we can deck-check vocab claims.
  const [vocabClaimed, setVocabClaimed]       = useState<Set<string>>(new Set());
  const [tomorrowClaimed, setTomorrowClaimed] = useState<Set<string>>(new Set());

  // Seed from storage so previously-added words don't re-show action buttons.
  useEffect(() => {
    storage.getClaimedWords().then(claimed => {
      setVocabClaimed(new Set(claimed.vocab));
      setTomorrowClaimed(new Set(claimed.tomorrow));
    });
  }, []);

  const closePopup = useCallback(() => setPopup(null), []);

  const openPopup = useCallback((e: React.MouseEvent, token: PassageToken) => {
    if (!token.pinyin) return;
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    const entry = lookupWord(token.text, token.pinyin, token.meaning || '');
    const el = e.currentTarget as HTMLElement;
    const rects = el.getClientRects();
    const rect = rects.length > 0 ? rects[0] : el.getBoundingClientRect();

    // A vocab claim is only valid when the word is still in the deck.
    // If deckWords is not provided we conservatively trust the claim.
    const isVocabClaimed = vocabClaimed.has(token.text) &&
      (deckWords === undefined || deckWords.has(token.text));
    const isTomorrowClaimed = tomorrowClaimed.has(token.text);

    let type: PopupData['type'];
    if (isVocabClaimed)    type = 'lookup';
    else if (isTomorrowClaimed) type = 'tomorrow';
    else                   type = 'free';

    setPopup({ word: token.text, pinyin: entry.pinyin, meaning: entry.meaning, type, anchorRect: rect });
  }, [vocabClaimed, tomorrowClaimed, deckWords]);

  const handleAddVocab = useCallback(async (word: string, pinyin: string, meaning: string) => {
    setVocabClaimed(prev => new Set([...prev, word]));
    onAddVocab?.(word, pinyin, meaning);
    const c = await storage.getClaimedWords();
    await storage.saveClaimedWords({ ...c, vocab: [...new Set([...c.vocab, word])] });
  }, [onAddVocab]);

  const handleLearnTomorrow = useCallback(async (word: string) => {
    setTomorrowClaimed(prev => new Set([...prev, word]));
    const c = await storage.getClaimedWords();
    await storage.saveClaimedWords({ ...c, tomorrow: [...new Set([...c.tomorrow, word])] });
    closePopup();
  }, [closePopup]);

  return { popup, openPopup, closePopup, handleAddVocab, handleLearnTomorrow, vocabClaimed, tomorrowClaimed };
}
