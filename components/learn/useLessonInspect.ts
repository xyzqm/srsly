'use client';
import { useCallback, useState } from 'react';
import type { LanguageCode } from '@/lib/types';
import { bareWord } from '@/lib/lessonPractice';
import { lookupReading } from '@/lib/data/lookup';
import type { PopupData } from '@/components/read/WordPopup';

/**
 * "What does this word mean?", for every word the Learn tab prints.
 *
 * ── WHY IT IS NOT `useWordPopup` ──
 * That hook is driven by a React mouse event, and half the gestures here do not have one — a
 * long-press produces no click at all. This builds `PopupData` directly from an element, the
 * same way `PassageText` does and for the same reason.
 *
 * ── AND WHY THE SYNCHRONOUS LOOKUP IS NOT ENOUGH ──
 * The client dictionaries are keyed by HEADWORD and deinflect nothing; `lib/data/esdict.ts`
 * says so outright, because everywhere else in the app the base form has already been resolved
 * server-side and travels on the token. A lesson tile is a bare string with no such help, so
 * in Spanish and French — where nearly every verb on screen is conjugated — tapping a word
 * silently did nothing. `tenemos`, `escribimos` and `j'ai` are all real words the app can
 * define and could not find.
 *
 * So a miss falls through to the same per-language route `AddWordForm` already uses, which
 * runs the real lemmatizer. It costs one request, only on a word the dictionary could not
 * resolve, and only when someone actually asks.
 *
 * Chinese needs none of this and gets none: it does not inflect, so the first lookup either
 * finds the word or the word is not in the dictionary at all.
 */

/** Which languages have a server route that can deinflect a bare surface form. */
const DEINFLECTS: Partial<Record<LanguageCode, string>> = {
  es: '/api/es-word-lookup',
  fr: '/api/fr-word-lookup',
  ja: '/api/ja-word-lookup',
};

export function useLessonInspect(language: LanguageCode) {
  const [popup, setPopup] = useState<PopupData | null>(null);

  const inspect = useCallback((tile: string, el: HTMLElement) => {
    const word = bareWord(tile);
    // Measured NOW, before any await: by the time a request comes back the element may have
    // moved, and a card that opens somewhere the learner is not looking is worse than late.
    const anchorRect = el.getBoundingClientRect();

    const { reading, meaning, baseForm, baseReading } = lookupReading(language, word);
    if (reading || meaning) {
      setPopup({ word, pinyin: reading, meaning, baseForm, baseReading, type: 'free', anchorRect });
      return;
    }

    const route = DEINFLECTS[language];
    if (!route) return;                 // nothing more to try; don't open an empty card
    void fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: word }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((r: { single?: boolean; reading?: string; meaning?: string; baseForm?: string | null } | null) => {
        if (!r?.single || !r.meaning) return;
        setPopup({
          word,
          pinyin: r.reading ?? '',
          meaning: r.meaning,
          baseForm: r.baseForm ?? undefined,
          type: 'free',
          anchorRect,
        });
      })
      .catch(() => { /* offline, or the route is unhappy — silence beats a broken card */ });
  }, [language]);

  return { popup, setPopup, inspect };
}
