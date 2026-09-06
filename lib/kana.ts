/**
 * `wanakana`, loaded on demand — romaji → kana as the learner types.
 *
 * ── WHY A LIBRARY HERE, WHEN lib/fsrs.ts IS HAND-ROLLED ──
 * This file is the "prefer a well-maintained library" half of the rule CLAUDE.md states.
 * Romaji→kana is a large, fiddly, fully-specified table — every yōon, every sokuon, `n` before
 * a consonant, `tsu`/`chi`/`shi` and their `tu`/`ti`/`si` alternates — with no judgement in it
 * anywhere. Nothing about srsly makes its version of that table better than WaniKana's, so
 * writing one would be work with no learner-visible upside. The scheduler is the opposite:
 * FSRS is where this app's opinions live.
 *
 * ── DYNAMICALLY IMPORTED, LIKE EVERY OTHER LANGUAGE-SPECIFIC ASSET ──
 * 21 kB minified, and only Japanese sessions can ever use it. A static import would put a
 * romaji table in the initial bundle for every Chinese, Spanish and French learner — the same
 * failure the level tables and `lib/data/han-decomp.json` describe. Cached after the first
 * call and null on failure, so a caller renders the plain input rather than a broken one.
 *
 * ── IT IS NOT USED FOR GRADING ──
 * Only for input. `lib/typedAnswer.ts` compares kana with a codepoint shift and stays
 * synchronous, because wanakana's own `toHiragana` expands the long mark (コーヒー → こうひい)
 * while a learner typing `ko-hi-` produces こーひー, and a grader that disagrees with itself
 * about 10% of Japanese readings is worse than no grader.
 */
type WanaKana = typeof import('wanakana');

let cache: WanaKana | null = null;
let loading: Promise<WanaKana | null> | null = null;

export async function loadKana(): Promise<WanaKana | null> {
  if (cache) return cache;
  if (!loading) {
    loading = import('wanakana')
      .then(m => { cache = m; return cache; })
      .catch(() => { loading = null; return null; });
  }
  return loading;
}
