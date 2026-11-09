/**
 * THE HAN WEBFONT IS 98% OF THE FONT CSS AND MOST LEARNERS NEVER SEE A HAN CHARACTER.
 *
 * `app/layout.tsx` linked ONE Google Fonts stylesheet naming thirteen families, render-blocking,
 * on every load in every language. Measured on the wire, gzipped, with a Pixel user agent:
 *
 *     the eleven Latin families together      3.4 kB
 *     Noto Serif SC + Noto Sans SC          185.6 kB
 *     ────────────────────────────────────────────────
 *     what every learner actually downloaded  188.8 kB
 *
 * The two CJK families are 340 kB EACH uncompressed, because a Han webfont is declared as
 * hundreds of `unicode-range` subsets and the stylesheet has to name every one. So 98% of a
 * blocking stylesheet was Chinese font declarations — fetched in full by a learner studying
 * only Spanish, who has no use for a single byte of it.
 *
 * ── WHAT IT COST, MEASURED RATHER THAN ESTIMATED ──
 * On a throttled phone profile (412x915, 400 kbps, 400 ms RTT) a cold load put text in `main`
 * at **12.9 seconds**, of which this stylesheet is 185 kB of a 547 kB critical path. The
 * second load was 0.66 s and every one after it ~0.29 s, because by then it was all cached.
 * That is exactly the shape of the report it was found by — "sometimes when I load in it
 * doesn't load so I have to reload and then it loads in". Nothing was failing. A first load
 * was taking thirteen seconds, and a reload looked like a fix because it was reading a warm
 * cache.
 *
 * ── IT IS THE RULE THIS PROJECT ALREADY STATES, BROKEN IN A PLACE NOBODY LOOKED ──
 * CLAUDE.md: *"Nothing that renders on every screen may import a language's data."* That rule
 * is why the level tables, the dictionaries, the grammar tables and the lesson prose are all
 * loaded on demand — and it was written about JavaScript, so a `<link>` in the document head
 * was never checked against it. A webfont for a script you cannot read is a language's data.
 *
 * ── TWO DEFENCES, BECAUSE EITHER ALONE LEAVES A HOLE ──
 *  1. **It is not linked in the document.** The head carries the Latin families only, so the
 *     blocking cost is 3.4 kB for everybody and the CJK CSS is never on the critical path.
 *  2. **It is injected only where a Han glyph can appear**, from the pre-paint script for the
 *     common case and from here on a language change. A learner who never studies Chinese or
 *     Japanese never requests it at all.
 *
 * Defence 1 alone would still download 185 kB for a Spanish learner, merely later. Defence 2
 * alone would still block the first paint of every Chinese session on a 185 kB stylesheet.
 *
 * ── `display=swap` IS WHAT MAKES THIS SAFE, AND THE FALLBACK IS GOOD ──
 * Han text paints immediately in the device's own CJK font — PingFang on iOS, Noto on Android,
 * both excellent — and swaps when this arrives. The alternative was blocking every learner's
 * first paint on it, which is not a trade this app should make for a font substitution nobody
 * would notice. `--f-han` falls back to `serif`/`sans-serif` in `globals.css` for the same
 * reason, which is also what the handful of Latin uses of that variable get.
 */
import type { LanguageConfig } from '@/lib/languageConfig';

/**
 * The CJK half of the old combined request, verbatim. Kept as ONE string used by both the
 * document's pre-paint script and this module: two copies would differ by a weight the day
 * somebody edited one, and a mismatch means two separate 185 kB downloads rather than one
 * cache hit. `tests/hanFont.test.ts` asserts the two halves reassemble the original thirteen
 * families, so a family cannot be dropped from both sides at once.
 */
export const HAN_FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600'
  + '&family=Noto+Sans+SC:wght@400;500;600&display=swap';

/** Marks the injected link so a second call is a no-op. */
const MARK = 'data-srsly-han-font';

/**
 * Add the Han stylesheet if it is not already there, and ONLY for a language that can show a
 * Han character.
 *
 * ── IT TAKES THE CONFIG RATHER THAN NOTHING, AND THAT IS THE WHOLE GUARD ──
 * The three callers in `app/page.tsx` sit on the language-change path, which fires for Spanish
 * and French too. A no-argument version would have fetched 185 kB of Chinese font declarations
 * the moment a learner switched to Spanish — the exact cost this module exists to avoid,
 * reintroduced by the code meant to manage it. `scriptIsUnspaced` is the config flag that
 * already means "this script needs Han handling" (zh, ja), so the decision reads off the
 * config rather than a `language === 'zh' || language === 'ja'` ternary, which CLAUDE.md names
 * as the signal that a difference belongs on the config.
 *
 * Idempotent, so the common case — the pre-paint script already added it — costs one
 * `querySelector`. It does NOT remove the link when the learner switches away: unloading a
 * stylesheet saves nothing once it is cached and would reflow any Han text still on screen.
 */
export function ensureHanFont(cfg: Pick<LanguageConfig, 'scriptIsUnspaced'>): void {
  if (!cfg.scriptIsUnspaced) return;
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[${MARK}]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = HAN_FONT_HREF;
  link.setAttribute(MARK, '1');
  /**
   * ⚠ NON-BLOCKING, AND LEAVING THIS OFF PUT THE 185 kB BACK FOR THE LEARNERS WHO NEED IT.
   *
   * A `<link rel=stylesheet>` blocks rendering wherever it is added, so the first version of
   * this function removed the cost for Spanish and French and kept every byte of it for
   * Chinese and Japanese — which is most of a Han learner's first paint and precisely the
   * audience the stylesheet is for. Found by measuring the request rather than by reading the
   * code: the saving was real for two languages and zero for the other two.
   *
   * `media='print'` is how a stylesheet is fetched without blocking: it does not apply to the
   * screen, so the browser drops it off the critical path, and flipping `media` to `all` once
   * it has loaded applies it. Paired with `display=swap` the result is that Han text paints
   * immediately in the device's own CJK font — PingFang on iOS, Noto on Android, both
   * excellent — and swaps to the theme's face a moment later.
   *
   * `onload` is assigned BEFORE `href`/append in the DOM sense that matters here: the property
   * is set before the element is in the document, so a cached stylesheet that resolves
   * instantly cannot fire the event before anybody is listening.
   */
  link.media = 'print';
  link.onload = () => { link.media = 'all'; };
  document.head.appendChild(link);
}
