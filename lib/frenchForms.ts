/**
 * French inflected form → lemma, for the READABILITY metric.
 *
 * The Spanish sibling (`lib/spanishForms.ts`) carries the long argument; this is the same one,
 * and French needs it for the same two reasons plus a third.
 *
 * ── THE TWO HALVES SPANISH ALREADY HAD ──
 * The bands are keyed by LEMMA and `calculateReadability` looks a token up by
 * `baseForm ?? text`. `frenchLemmatizer` deliberately leaves a surface alone when it is itself
 * a common headword — the `livre`/`porte`/`ferme` homograph rule — so those arrive carrying no
 * `baseForm` and miss the index. And a surface that HAS its own band never consults a lemma at
 * all, so an inflection of an A1 word can read four bands harder than the word it inflects.
 *
 * ── AND THE THIRD, WHICH IS FRENCH'S OWN ──
 * French is structurally worse than Spanish here: **107 of the 677 A1 words carry at least one
 * inflection banded above A1, 150 in total**, against Spanish's 64 and 83. `est` — the single
 * commonest verb form in the language — sits at A2 while `être` is A1.
 *
 * ── MEASURED BEFORE IT WAS BUILT, WHICH IS WHY IT EXISTS ──
 * A structural count is an upper bound on a question nobody asked; in Spanish 83 structural
 * forms became 18 actual tokens in 1879. There is no French sweep to measure against, and one
 * costs provider quota and an evening — so it was measured on the French prose this repository
 * ALREADY contains: the three starter texts plus the Learn tab's 84 practice sentences, run
 * through the real segmenter (`scripts/measure-fr-lemma.ts`, which needs no key and no
 * network). Over 526 measured tokens, above-A1 went **8.2% → 5.9%**: the cap is worth **2.3
 * points**, more than double what the same change bought Spanish. `parti` stops being among
 * the hardest words in a beginner text, and at A2 so do `oublie`, `écoute` and `couche`.
 *
 * ── THE COST, MEASURED ──
 * 1.67 MB raw / **266 kB gzipped**, in its own lazily-imported chunk — larger than Spanish's
 * 191 kB because French Wiktionary conjugates more exhaustively. Against a `frdict.json` every
 * French learner downloads anyway, and loaded only when a readability figure is actually
 * rendered. Lazy, never at module scope, and cached: the same contract as `loadEsForms` and
 * `loadLevelTable`.
 */
let cache: Record<string, string> | null = null;

export async function loadFrForms(): Promise<Record<string, string> | null> {
  if (cache) return cache;
  try {
    const { FR_FORMS } = await import('./data/fr-forms');
    cache = FR_FORMS;
    return cache;
  } catch {
    return null;
  }
}

/** The already-loaded table, or null — synchronous, so a second passage measures on frame one. */
export function cachedFrForms(): Record<string, string> | null {
  return cache;
}
