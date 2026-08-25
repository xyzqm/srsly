'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { loadFrGrammar, cachedFrGrammar, lookupGrammar as lookupFr } from '@/lib/frenchGrammar';
import { loadEsGrammar, cachedEsGrammar, lookupGrammar as lookupEs } from '@/lib/spanishGrammar';
import type { LanguageCode } from '@/lib/types';

/**
 * One shape per language, dispatched here.
 *
 * The two tables are built from different sources and decoded by different rules — Lexique's
 * positional codes for French, Wiktionary's tag sets for Spanish — but they answer the same
 * question and expose the same three functions, so a third language is a third entry rather
 * than a change to this component. That was the point of keeping the seam at the module.
 */
const GRAMMARS: Partial<Record<LanguageCode, {
  load: () => Promise<unknown>;
  cached: () => unknown;
  lookup: (t: never, w: string, b?: string) => string[];
}>> = {
  fr: { load: loadFrGrammar, cached: cachedFrGrammar, lookup: lookupFr as never },
  es: { load: loadEsGrammar, cached: cachedEsGrammar, lookup: lookupEs as never },
};

/**
 * What the word you tapped is DOING — "imperfect · 3rd person singular", "feminine plural".
 *
 * The app has always known this and never said it. `lemmatizeFr` resolves `abaissait →
 * abaisser` so the token can link to the right card, and the popup then shows the definition
 * of "abaisser" with no hint that you are looking at an imperfect. This is that silent step,
 * printed.
 *
 * FRENCH AND SPANISH, because those are the two with the data. French reads Lexique 3, already
 * vendored for frequency ranking; Spanish reads the inflection tags on Wiktionary's `form_of`
 * senses, which `build-esdict.mjs` sees and discards. Japanese has kuromoji at runtime and would
 * be a third design; Chinese has no inflection to describe at all.
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
    const g = GRAMMARS[language];
    const t = g?.cached();
    return t ? g!.lookup(t as never, word, baseForm) : [];
  });

  useEffect(() => {
    let live = true;
    const g = GRAMMARS[language];
    if (!g || !word || !baseForm) { setLines([]); return; }
    void g.load().then(table => {
      if (!live || !table) return;
      setLines(g.lookup(table as never, word, baseForm));
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
      {/* Separate readings are separate facts, and Spanish forms carry several far more often
          than French ones do. Joined with the same '·' the parts of ONE reading use, `llega`
          read "present · 3rd person singular · imperative · 2nd person singular" — one long
          chain that looks like a single description of something impossible. */}
      {lines.map((l, i) => (
        <div key={l}>
          {i > 0 && <span style={{ opacity: .5 }}>or </span>}
          {l}
        </div>
      ))}
    </div>
  );
}
