'use client';
import { useState, useCallback } from 'react';
import type { PassageToken } from '@/lib/types';
import type { PopupData } from '@/components/read/WordPopup';
import { lookupWord } from '@/lib/data/dict';
import { pickReading, type ReadingHint } from '@/lib/readings';
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
  deckReadings?: Map<string, ReadingHint[]>,
) {
  const [popup, setPopup] = useState<PopupData | null>(null);

  // Track vocab and tomorrow claims separately so we can deck-check vocab claims.
  const [vocabClaimed, setVocabClaimed]       = useState<Set<string>>(new Set());
  const [tomorrowClaimed, setTomorrowClaimed] = useState<Set<string>>(new Set());

  // No storage seeding — badges only show when the user explicitly acts
  // in the current session. Deck membership (deckWords) prevents "Add to vocab"
  // from appearing for words already in the deck.

  const closePopup = useCallback(() => setPopup(null), []);

  const openPopup = useCallback((e: React.MouseEvent, token: PassageToken) => {
    if (!token.pinyin) return;
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    const entry = lookupWord(token.text, token.pinyin, token.meaning || '');
    const el = e.currentTarget as HTMLElement;
    const rects = el.getClientRects();
    const rect = rects.length > 0 ? rects[0] : el.getBoundingClientRect();

    const isInDeck            = deckWords !== undefined && deckWords.has(token.text);
    const isVocabThisSession  = vocabClaimed.has(token.text);
    const isTomorrowThisSession = tomorrowClaimed.has(token.text);

    // Popup type priority:
    //   1. Added to deck in this session → 'lookup' (show +Added badge)
    //   2. Already in deck from a previous session → 'lookup' (no add button)
    //   3. Marked learn-tomorrow this session → 'tomorrow'
    //   4. Unknown word → 'free' (show Add to vocab / Learn this word)
    let type: PopupData['type'];
    if (isVocabThisSession || isInDeck) type = 'lookup';
    else if (isTomorrowThisSession)     type = 'tomorrow';
    else                                type = 'free';

    // For a word in the user's deck, show THEIR customized pinyin + meaning (not the
    // dictionary's). For a polyphone, headline the reading matching this token's pinyin
    // and list the rest under "also read as".
    let pinyin = entry.pinyin, meaning = entry.meaning;
    let otherReadings: { p: string; m: string }[] | undefined;
    const all = deckReadings?.get(token.text);
    if (all && all.length >= 1) {
      const matched = pickReading(all, token.pinyin) ?? all[0];
      pinyin = matched.p || entry.pinyin;
      meaning = matched.m || entry.meaning;
      if (all.length > 1) {
        otherReadings = all.filter(r => r !== matched).map(r => ({ p: r.p, m: r.m }));
      }
    }

    setPopup({ word: token.text, pinyin, meaning, type, anchorRect: rect, otherReadings });
  }, [vocabClaimed, tomorrowClaimed, deckWords, deckReadings]);

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
