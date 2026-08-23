'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { loadFrGrammar, cachedFrGrammar, lookupGrammar } from '@/lib/frenchGrammar';

/**
 * What the word you tapped is DOING — "imperfect · 3rd person singular", "feminine plural".
 *
 * The app has always known this and never said it. `lemmatizeFr` resolves `abaissait →
 * abaisser` so the token can link to the right card, and the popup then shows the definition
 * of "abaisser" with no hint that you are looking at an imperfect. This is that silent step,
 * printed.
 *
 * FRENCH ONLY, for now, because the data is. Lexique 3 is already vendored for frequency
 * ranking and records the exact slot of every inflected form; Spanish would need the tags
 * `build-esdict.mjs` currently discards, and Chinese has no inflection to describe at all. The
 * hook is `lib/frenchGrammar.ts`, so a second language is a second table, not a second design.
 *
 * IT IS AN EXPLANATION, NOT A CONTROL — same register as CharacterBreakdown sitting below it.
 * But unlike that one it is NOT collapsed: it is one short line, and the whole point is that
 * you meet it without having asked, in the middle of reading.
 */

interface Props {
  /** The surface form as it appears in the text — `abaissait`, not `abaisser`. */
  word: string;
  /** The lemma the app resolved. Its ABSENCE is meaningful; see lookupGrammar. */
  baseForm?: string;
  /** Rendered inside the dark lookup popup, which has its own palette. */
  variant?: 'popup' | 'panel';
}

export default function GrammarNote({ word, baseForm, variant = 'panel' }: Props) {
  const language = useLanguage();
  // Seeded from the cache so a second popup renders on its first frame rather than blinking
  // the line in one commit late — the same reasoning as `cachedLevelTable` in lib/curriculum.ts.
  const [lines, setLines] = useState<string[]>(() => {
    const t = language === 'fr' ? cachedFrGrammar() : null;
    return t ? lookupGrammar(t, word, baseForm) : [];
  });

  useEffect(() => {
    let live = true;
    if (language !== 'fr' || !word || !baseForm) { setLines([]); return; }
    void loadFrGrammar().then(table => {
      if (!live || !table) return;
      setLines(lookupGrammar(table, word, baseForm));
    });
    return () => { live = false; };
  }, [language, word, baseForm]);

  if (!lines.length) return null;

  const popup = variant === 'popup';
  return (
    <div
      style={{
        marginTop: 5,
        fontFamily: 'var(--f-mono)',
        fontSize: popup ? 10.5 : 11,
        letterSpacing: '.03em',
        lineHeight: 1.45,
        opacity: popup ? 0.62 : 0.55,
        color: popup ? 'var(--pop-fg)' : 'var(--ink)',
      }}
    >
      {lines.join(' · ')}
    </div>
  );
}
