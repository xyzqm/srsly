import type { LanguageCode } from './types';
/**
 * `hanzi-writer`, loaded on demand — the stroke-by-stroke drawing surface.
 *
 * ── DYNAMICALLY IMPORTED, LIKE EVERY OTHER LANGUAGE-SPECIFIC ASSET ──
 * 863 kB unpacked, and only a Chinese learner who opens Write can ever use it. A static import
 * would put a whole animation and stroke-matching engine in the initial bundle for every
 * Spanish, French and Japanese learner — the same failure the level tables, the French grammar
 * table and the lesson tree all describe. Cached after the first call, null on failure so the
 * caller can say so rather than rendering a dead square.
 *
 * ── WHY A LIBRARY HERE ──
 * Stroke matching is the whole feature and none of it is srsly's opinion: comparing a drawn
 * path against a median, deciding leniency, ordering strokes, animating a hint. Hand-rolling
 * it would be a worse version of a solved problem. The scheduler on the other side of it
 * (`lib/writingState.ts`) is where this app's judgement actually lives.
 */
type HanziWriterModule = typeof import('hanzi-writer');

let cache: HanziWriterModule | null = null;
let loading: Promise<HanziWriterModule | null> | null = null;

export async function loadHanziWriter(): Promise<HanziWriterModule | null> {
  if (cache) return cache;
  if (!loading) {
    loading = import('hanzi-writer')
      .then(m => { cache = m; return cache; })
      .catch(() => { loading = null; return null; });
  }
  return loading;
}

/**
 * Where a character's strokes come from.
 *
 * `public/strokes/` is srsly's own subset (see scripts/build-strokes.mjs), NOT a CDN. Reading
 * from jsDelivr would be one line shorter and would make the feature depend on a third party
 * being up, would leak which characters a learner is practising to a host they never chose,
 * and would break the offline story the rest of the data layer keeps. The 404 for a character
 * outside HSK is meaningful and handled: the session skips it rather than hanging.
 */
export function strokeDataUrl(char: string, language: LanguageCode = 'zh'): string {
  return `${STROKE_DIRS[language] ?? STROKE_DIRS.zh}/${encodeURIComponent(char)}.json`;
}

/**
 * ONE DIRECTORY PER LANGUAGE, AND THEY ARE DIFFERENT DATA RATHER THAN A COPY.
 *
 * A table rather than a ternary, which is this project's rule about a difference between
 * languages — a third script is a third row here. The two sets genuinely disagree: 骨 is TEN
 * strokes in the Japanese data and NINE in the Chinese, and 直, 令 and 画 share a stroke count
 * while differing in every path. Serving one from the other would teach confidently wrong
 * stroke order, which is the exact reason handwriting was Chinese-only until the Japanese data
 * was found. See `scripts/build-strokes-ja.mjs`.
 */
const STROKE_DIRS: Partial<Record<LanguageCode, string>> = {
  zh: '/strokes',
  ja: '/strokes-ja',
};
