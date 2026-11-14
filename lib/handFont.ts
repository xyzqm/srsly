/**
 * The handwriting face for margin notes — loaded late, off the critical path, and only for a
 * language that has one.
 *
 * ── WHY IT IS NOT IN `app/layout.tsx` WITH THE OTHER FONTS ──
 * That stylesheet blocks the first paint for every learner, which is exactly how 185 kB of
 * Chinese font declarations came to cost a Spanish learner three seconds (see `lib/hanFont.ts`).
 * A hand font decorates two tabs and one language at a time, so it follows the rule that fix
 * established: a font for something not every screen shows is not linked in the document.
 *
 * `media='print'` then `all` on load is the same non-blocking trick `ensureHanFont` uses, and
 * for the same reason — a `<link rel=stylesheet>` blocks rendering wherever it is added. Until
 * it arrives the note is set in the display face, which is what `--f-hand` falls back to in
 * `CahierPage`; `display=swap` means text is never invisible while it loads.
 *
 * The href is BUILT from the config's family name rather than written out, so the font a
 * language names and the font that is fetched cannot be two different strings.
 */
import type { LanguageConfig } from '@/lib/languageConfig';

const MARK = 'data-srsly-hand-font';

/** The Google Fonts css2 address for a family. Exported for `tests/cahier.test.ts`. */
export function handFontHref(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.trim().replace(/\s+/g, '+')}:wght@100..400&display=swap`;
}

/** Add the stylesheet for this language's hand font, once. A no-op where it has none. */
export function ensureHandFont(cfg: Pick<LanguageConfig, 'handFont'>): void {
  if (!cfg.handFont || typeof document === 'undefined') return;
  const links = document.querySelectorAll(`link[${MARK}]`);
  for (const l of links) if (l.getAttribute(MARK) === cfg.handFont) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = handFontHref(cfg.handFont);
  link.setAttribute(MARK, cfg.handFont);
  link.media = 'print';
  link.onload = () => { link.media = 'all'; };
  document.head.appendChild(link);
}
