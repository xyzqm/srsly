'use client';
import { useState, useCallback, useMemo } from 'react';
import { storage } from '@/lib/storage';

export type ClaimKind = 'vocab' | 'tomorrow';

export interface ClaimsStore {
  /** word → how it was claimed this session ('vocab' = added to deck, 'tomorrow' = preview). */
  claims: Map<string, ClaimKind>;
  claimVocab: (word: string) => void;
  claimTomorrow: (word: string) => void;
}

/**
 * Session claim state shared across the Read tab's title and passage body, so a word
 * added (or queued for tomorrow) in one place shows the same badge/popup in the other.
 *
 * No storage seeding — badges only appear for words the user acted on this session;
 * words added in earlier sessions surface as SRS review words (handled by deck membership
 * in the consumers), not as fresh claims.
 */
export function useClaims(): ClaimsStore {
  const [claims, setClaims] = useState<Map<string, ClaimKind>>(new Map());

  const claimVocab = useCallback(async (word: string) => {
    setClaims(prev => {
      if (prev.get(word) === 'vocab') return prev;
      return new Map(prev).set(word, 'vocab');
    });
    const c = await storage.getClaimedWords();
    await storage.saveClaimedWords({ ...c, vocab: [...new Set([...c.vocab, word])] });
  }, []);

  const claimTomorrow = useCallback(async (word: string) => {
    setClaims(prev => {
      // A vocab claim outranks a tomorrow preview; never downgrade.
      if (prev.get(word) === 'vocab' || prev.get(word) === 'tomorrow') return prev;
      return new Map(prev).set(word, 'tomorrow');
    });
    const c = await storage.getClaimedWords();
    await storage.saveClaimedWords({ ...c, tomorrow: [...new Set([...c.tomorrow, word])] });
  }, []);

  return useMemo(() => ({ claims, claimVocab, claimTomorrow }), [claims, claimVocab, claimTomorrow]);
}
