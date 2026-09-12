/**
 * Spanish inflected form → lemma, for the READABILITY metric.
 *
 * ── WHY THE METRIC NEEDS A DEINFLECTION TABLE AT ALL ──
 * The level bands are keyed by LEMMA, and `calculateReadability` looks a token up by
 * `baseForm ?? text`. That works for the words the server lemmatized — but
 * `spanishLemmatizer` deliberately leaves a surface alone when the surface is ITSELF a
 * common headword, which is the documented `mercado` / `para` short-circuit that stops
 * over-lemmatization. So `una`, `son`, `hay`, `sus`, `esos`, `me`, `era`, `veces` and `paso`
 * arrive carrying no `baseForm`, miss the band index, and are counted as ABOVE the learner's
 * level — every one of them an inflection of a word that is already in A1.
 *
 * Two correct decisions colliding, and measured before it was fixed: **6.9% of all measured
 * tokens (57 of 831, across six generated passages at A1–B2) were in no band at all**, and
 * the frequent ones were entirely function words. It is the same failure French already had,
 * where `au`, `aux`, `des`, `ma` and `ces` "were in NO band … so they scored as above-level
 * and turned up among a text's hardest words" — fixed there by pinning them into a band.
 * Spanish is fixed here instead, because the data to do it properly already ships.
 *
 * ── WHY THIS AND NOT A PIN LIST ──
 * A pin list is a dozen hand-chosen words that someone has to keep extending; this table is
 * Wiktionary's own `form_of` data and covers all 48,706 of them, including the irregulars
 * (`fui` → `ser`, `voy` → `ir`) that a hand list gets wrong. It is the same table the SERVER
 * lemmatizer already reads — so the metric and the lemmatizer now agree about what a word is,
 * rather than disagreeing quietly.
 *
 * ── THE COST, MEASURED ──
 * 1.11 MB raw / **193 kB gzipped**, in its own lazily-imported chunk. Less than half the
 * French grammar table this project already loads the same way (427 kB gzipped), and against
 * an `esdict.json` of 5.78 MB that every Spanish learner downloads anyway. A build-time
 * subset — only forms whose lemma is banded and which are not themselves banded — was
 * measured at 118 kB gzipped, saving 75 kB for the price of a new generated file that can go
 * stale against its source. Not worth it at this size; recorded so it is not re-derived.
 *
 * Lazy, never at module scope, and cached — the same contract as `loadEsGrammar` and
 * `loadLevelTable`.
 */
let cache: Record<string, string> | null = null;

export async function loadEsForms(): Promise<Record<string, string> | null> {
  if (cache) return cache;
  try {
    const { ES_FORMS } = await import('./data/es-forms');
    cache = ES_FORMS;
    return cache;
  } catch {
    return null;
  }
}

/** The already-loaded table, or null — synchronous, so a second passage measures on frame one. */
export function cachedEsForms(): Record<string, string> | null {
  return cache;
}
