'use client';
import { useState, useCallback } from 'react';
import type { PassageToken } from '@/lib/types';
import type { PopupData } from '@/components/read/WordPopup';
import { lookupReadingAsync } from '@/lib/data/lookup';
import { useLanguage } from '@/lib/LanguageContext';
import { pickReading, type ReadingHint } from '@/lib/readings';
import { storage } from '@/lib/storage';
import type { ClaimsStore } from '@/hooks/useClaims';

/**
 * Shared hook for word-definition popups.
 *
 * @param onAddVocab  Called when the user clicks "Add to vocab".
 * @param deckWords   Optional live set of words currently in the user's deck.
 *                    When provided, a stale 'vocab' claim for a word that was
 *                    removed from the deck is treated as unclaimed — so the
 *                    "Add to vocab" button re-appears.
 * @param claimsStore Optional external claim store. When provided, claims are read from
 *                    and written to it (so the title shares state with the passage body);
 *                    otherwise the hook keeps its own per-instance claim state.
 */
export function useWordPopup(
  onAddVocab?: (word: string, pinyin: string, meaning: string) => void,
  deckWords?: Set<string>,
  deckReadings?: Map<string, ReadingHint[]>,
  claimsStore?: ClaimsStore,
  poolWords?: Set<string>,
  onReleaseFromPool?: (word: string) => void,
) {
  const [popup, setPopup] = useState<PopupData | null>(null);
  const language = useLanguage();

  // Track vocab claims so we can deck-check them.
  const [vocabClaimed, setVocabClaimed] = useState<Set<string>>(new Set());

  // No storage seeding — badges only show when the user explicitly acts
  // in the current session. Deck membership (deckWords) prevents "Add to vocab"
  // from appearing for words already in the deck.

  const closePopup = useCallback(() => setPopup(null), []);

  const openPopup = useCallback((e: React.MouseEvent, token: PassageToken) => {
    // "reading OR meaning", never reading alone. This gate is what kept the lookup popup
    // from ever opening in the extra modes (fill-in-the-blank, conversation, questions):
    // Spanish and French have no reading layer at all, so every token failed it,
    // and in Chinese any token whose pinyin didn't resolve was dead too. PassageText's own
    // handler uses the same test — the two must agree or Read and Extras behave differently.
    if (token.type === 'punct' || !(token.reading || token.meaning)) return;
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    // Capture the anchor rect synchronously before anything async happens.
    const el = e.currentTarget as HTMLElement;
    const rects = el.getClientRects();
    const rect = rects.length > 0 ? rects[0] : el.getBoundingClientRect();

    // Look up by the token's base form when it has one (a conjugated word — kuromoji already
    // resolved this server-side, see PassageToken.baseForm) since JMdict is keyed by
    // dictionary form, not surface form. Use async lookup so JMdict is always loaded, even if
    // jmdictCache was reset by HMR or first open — after the first load it resolves instantly.
    const lookupKey = token.baseForm ?? token.text;
    void lookupReadingAsync(language, lookupKey, token.reading, token.meaning || '').then(entry => {
      // For Japanese conjugated forms, use the base/dictionary form as the canonical key
      // for deck membership checks to avoid adding duplicates (e.g. 渡します when 渡す is in deck).
      const canonicalWord = token.baseForm ?? token.text;

      const isInDeck           = deckWords !== undefined && (deckWords.has(token.text) || deckWords.has(canonicalWord));
      const isInPool           = isInDeck && poolWords !== undefined && (poolWords.has(token.text) || poolWords.has(canonicalWord));
      const isVocabThisSession = claimsStore
        ? (claimsStore.claims.get(token.text) === 'vocab' || claimsStore.claims.get(canonicalWord) === 'vocab')
        : (vocabClaimed.has(token.text) || vocabClaimed.has(canonicalWord));

      // Popup type priority:
      //   1. In pool (staged, not yet in play) → 'pool' (definition, release button)
      //   2. Added this session, or already in the deck → 'lookup' (definition + a badge
      //      that distinguishes the two: one confirms an action, the other states a fact)
      //   3. Unknown word → 'free' (show Add to vocab)
      const type: PopupData['type'] = isInPool ? 'pool' : (isVocabThisSession || isInDeck) ? 'lookup' : 'free';
      const justAdded = isVocabThisSession && !isInDeck;

      // For a word in the user's deck, show THEIR customized pinyin + meaning (not the
      // dictionary's). For a polyphone, headline the reading matching this token's pinyin
      // and list the rest under "also read as". The token's own reading/meaning (already
      // resolved server-side) take priority; the fresh lookup is mainly a fallback for
      // stale content and the source for the base form's own reading (entry was looked up
      // by baseForm when present, so entry.reading is the dictionary form's reading).
      let pinyin = token.reading || entry.reading, meaning = token.meaning || entry.meaning;
      let otherReadings: { p: string; m: string }[] | undefined;
      const all = deckReadings?.get(canonicalWord) ?? deckReadings?.get(token.text);
      if (all && all.length >= 1) {
        const matched = pickReading(all, token.reading || '') ?? all[0];
        pinyin = matched.p || pinyin;
        meaning = matched.m || meaning;
        if (all.length > 1) {
          otherReadings = all.filter(r => r !== matched).map(r => ({ p: r.p, m: r.m }));
        }
      }

      setPopup({
        word: token.text, pinyin, meaning, type, justAdded, anchorRect: rect, otherReadings,
        baseForm: token.baseForm, baseReading: token.baseForm ? entry.reading : undefined,
      });
    });
  }, [claimsStore, vocabClaimed, deckWords, deckReadings, language, poolWords]);

  const handleAddVocab = useCallback(async (word: string, pinyin: string, meaning: string) => {
    if (claimsStore) {
      claimsStore.claimVocab(word);
    } else {
      setVocabClaimed(prev => new Set([...prev, word]));
      const c = await storage.getClaimedWords();
      await storage.saveClaimedWords({ ...c, vocab: [...new Set([...c.vocab, word])] });
    }
    onAddVocab?.(word, pinyin, meaning);
  }, [onAddVocab, claimsStore]);

  return { popup, openPopup, closePopup, handleAddVocab, vocabClaimed, onReleaseFromPool };
}
