'use client';
import { useCallback, useEffect, useState } from 'react';
import { storage } from '@/lib/storage';
import { SUPPORTED_LANGUAGES } from '@/lib/languageConfig';
import { LEECH_THRESHOLD } from '@/lib/fsrs';
import { listBooks } from '@/lib/epubStore';
import { sectionCount } from '@/lib/epubProgress';
import { computeStats, evaluate, type EarnedAchievement } from '@/lib/achievements';
import { loadSeen, saveSeen, seedIfFirstRun, unannounced } from '@/lib/achievementsSeen';
import type { DeckWord, LanguageCode } from '@/lib/types';

/**
 * Milestones, gathered across EVERY language.
 *
 * Deliberately not scoped to the current language the way `useVocabDeck` is: "two languages"
 * and a lifetime word count are the kind of thing a per-language view cannot see, and they
 * are most of what makes a milestone feel like an arc rather than a daily total.
 *
 * Everything is derived on read — see lib/achievements.ts. This hook only gathers the inputs.
 */
export function useAchievements(refreshKey?: unknown) {
  const [earned, setEarned] = useState<EarnedAchievement[]>([]);
  const [next, setNext] = useState<EarnedAchievement[]>([]);
  const [fresh, setFresh] = useState<EarnedAchievement[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const decks: Partial<Record<LanguageCode, DeckWord[]>> = {};
    await Promise.all(SUPPORTED_LANGUAGES.map(async cfg => {
      try { decks[cfg.code] = await storage.getVocabDeck(cfg.code); } catch { /* skip */ }
    }));

    const srs = await storage.getSRSState();

    // A book counts as finished when its saved position is the last section of the last
    // non-empty chapter. Derived rather than flagged, for the same reason as everything else
    // here — a "finished" boolean would be a second record of what `position` already says.
    let booksFinished = 0;
    try {
      const books = await listBooks();
      booksFinished = books.filter(b => {
        const pos = b.position;
        if (!pos) return false;
        const lastChapter = b.chapters.map((c, i) => ({ i, n: sectionCount(b, i) }))
          .filter(c => c.n > 0).pop();
        return !!lastChapter && pos.chapter === lastChapter.i && pos.section === lastChapter.n - 1;
      }).length;
    } catch { /* no IndexedDB — books simply do not count */ }

    const stats = computeStats({ decks, srs, booksFinished, leechThreshold: LEECH_THRESHOLD });
    const result = evaluate(stats);
    setEarned(result.earned);
    setNext(result.next);

    // First run seeds silently: someone arriving with 400 words has earned a dozen milestones
    // at once, and opening the app to a dozen toasts is a bug, not a reward.
    const ids = result.earned.map(a => a.id);
    if (seedIfFirstRun(ids)) {
      setFresh([]);
    } else {
      const seen = loadSeen();
      const newIds = unannounced(ids, seen);
      setFresh(result.earned.filter(a => newIds.includes(a.id)));
    }
    setReady(true);
  }, []);

  useEffect(() => { void refresh(); }, [refresh, refreshKey]);

  /** Mark the freshly-earned as announced, so they are celebrated exactly once. */
  const acknowledge = useCallback(() => {
    const seen = loadSeen();
    fresh.forEach(a => seen.add(a.id));
    saveSeen(seen);
    setFresh([]);
  }, [fresh]);

  return { earned, next, fresh, ready, acknowledge, refresh };
}
