import type { MetadataRoute } from 'next';

/**
 * What makes srsly installable — on a phone, an iPad, or a desktop.
 *
 * Until this file existed it was a website that happened to work on a phone: no home-screen
 * icon, no standalone window, and no way to open it without going through a browser. For a
 * spaced-repetition app that gap is larger than it sounds, because reviews happen in dead
 * minutes — a queue, a lift, a bus — which is exactly when nobody is going to type a URL.
 *
 * `display: standalone` drops the browser chrome so it opens like an app. `start_url` is the
 * root rather than a remembered route, because SRS is the landing tab by design and a clip in
 * the URL is the one thing that overrides it (see initialTab in app/page.tsx).
 *
 * The colours are the app's own tokens, not new ones: `--accent` for the icon ground and the
 * theme bar, `--paper` behind the splash. They are written literally here because a manifest
 * is JSON served to the OS and cannot read a CSS variable — the one place in this codebase
 * where a hardcoded colour is correct rather than a slip.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    /**
     * ⚠ THIS IS THE INSTALL PROMPT'S LABEL, AND IT IS NOT THE HEADER.
     *
     * It read "srsly — read what you actually want to read", which was asked about as "the
     * tagline in the header" and is nowhere near the header: `components/Header.tsx` renders
     * the wordmark and nothing else, and never has. The sentence lives in exactly two places,
     * both of them metadata — here, where a phone shows it while asking whether to install,
     * and `app/layout.tsx`'s `description`, where a search engine reads it.
     *
     * Shortened here and LEFT ALONE THERE, because the two are not the same kind of copy. An
     * install prompt gets about three words of attention and the brand has to lead; a meta
     * description is read by a crawler that wants the four languages named, and that sentence
     * was already fixed once for saying "Chinese" long after Japanese, Spanish and French
     * shipped. Trimming it for tidiness would undo that.
     */
    name: 'srsly — language learning, in context',
    short_name: 'srsly',
    description:
      'Spaced repetition built around real reading, in Chinese, Japanese, Spanish and French.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F4F1EC',
    theme_color: '#B23A2E',
    categories: ['education'],
    icons: [
      // SVG first: one file, every size, and it stays sharp on any display.
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      // A raster fallback, because iOS home-screen icons do not take SVG.
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    ],
  };
}
