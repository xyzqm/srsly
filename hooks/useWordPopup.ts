'use client';
import { useState, useCallback } from 'react';
import type { PassageToken } from '@/lib/types';
import type { PopupData } from '@/components/read/WordPopup';
import { lookupWord } from '@/lib/data/dict';
import { storage } from '@/lib/storage';

/**
 * Shared hook for word-definition popups.
 * Pass `onAddVocab` to wire up the "Add to vocab" button.
 */
export function useWordPopup(
  onAddVocab?: (word: string, pinyin: string, meaning: string) => void
) {
  const [popup, setPopup] = useState<PopupData | null>(null);

  const openPopup = useCallback((e: React.MouseEvent, token: PassageToken) => {
    if (!token.pinyin) return;
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    const entry = lookupWord(token.text, token.pinyin, token.meaning || '');
    const el = e.currentTarget as HTMLElement;
    const rects = el.getClientRects();
    const rect = rects.length > 0 ? rects[0] : el.getBoundingClientRect();
    setPopup({
      word: token.text,
      pinyin: entry.pinyin,
      meaning: entry.meaning,
      type: 'free',
      anchorRect: rect,
    });
  }, []);

  const closePopup = useCallback(() => setPopup(null), []);

  const handleAddVocab = useCallback(async (word: string, pinyin: string, meaning: string) => {
    onAddVocab?.(word, pinyin, meaning);
    const c = await storage.getClaimedWords();
    await storage.saveClaimedWords({ ...c, vocab: [...new Set([...c.vocab, word])] });
    closePopup();
  }, [onAddVocab, closePopup]);

  const handleLearnTomorrow = useCallback(async (word: string) => {
    const c = await storage.getClaimedWords();
    await storage.saveClaimedWords({ ...c, tomorrow: [...new Set([...c.tomorrow, word])] });
    closePopup();
  }, [closePopup]);

  return { popup, openPopup, closePopup, handleAddVocab, handleLearnTomorrow };
}
