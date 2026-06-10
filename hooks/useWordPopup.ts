'use client';
import { useState, useCallback, useEffect } from 'react';
import type { PassageToken } from '@/lib/types';
import type { PopupData } from '@/components/read/WordPopup';
import { lookupWord } from '@/lib/data/dict';
import { storage } from '@/lib/storage';

/**
 * Shared hook for word-definition popups.
 * Pass `onAddVocab` to wire up the "Add to vocab" button.
 * Tracks which words have already been claimed so the popup shows
 * definition-only (no action buttons) after a word is added.
 */
export function useWordPopup(
  onAddVocab?: (word: string, pinyin: string, meaning: string) => void
) {
  const [popup, setPopup] = useState<PopupData | null>(null);
  // Track words claimed this hook instance + from previous sessions
  const [claimedSet, setClaimedSet] = useState<Set<string>>(new Set());

  // Seed from storage so previously-added words don't re-show action buttons
  useEffect(() => {
    storage.getClaimedWords().then(claimed => {
      const all = new Set([...claimed.vocab, ...claimed.tomorrow]);
      if (all.size > 0) setClaimedSet(all);
    });
  }, []);

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
      // Show 'lookup' (definition only, no buttons) if already claimed
      type: claimedSet.has(token.text) ? 'lookup' : 'free',
      anchorRect: rect,
    });
  }, [claimedSet]);

  const closePopup = useCallback(() => setPopup(null), []);

  const handleAddVocab = useCallback(async (word: string, pinyin: string, meaning: string) => {
    // Optimistic: mark claimed immediately so next click shows 'lookup'
    setClaimedSet(prev => new Set([...prev, word]));
    onAddVocab?.(word, pinyin, meaning);
    // Persist in background
    const c = await storage.getClaimedWords();
    await storage.saveClaimedWords({ ...c, vocab: [...new Set([...c.vocab, word])] });
  }, [onAddVocab]);

  const handleLearnTomorrow = useCallback(async (word: string) => {
    setClaimedSet(prev => new Set([...prev, word]));
    const c = await storage.getClaimedWords();
    await storage.saveClaimedWords({ ...c, tomorrow: [...new Set([...c.tomorrow, word])] });
    closePopup();
  }, [closePopup]);

  return { popup, openPopup, closePopup, handleAddVocab, handleLearnTomorrow };
}
