import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SUPPORTED_LANGUAGES } from '@/lib/languageConfig';

export const metadata: Metadata = {
  title: 'srsly?',
  // Four languages, not one. This read "Spaced repetition Chinese learning" long after
  // Japanese, Spanish and French shipped — and it is the line a first-time visitor and every
  // search engine sees, so it was the app's own description of itself being wrong in public.
  description: 'Read what you actually want to read, in Chinese, Japanese, Spanish or French. '
    + 'Spaced repetition built around your own reading.',

  /**
   * INSTALLABLE. `app/manifest.ts` carries the rest; these are the parts iOS reads and the
   * web manifest does not cover.
   *
   * `appleWebApp.capable` is what makes an iPad or iPhone open it in its own window instead
   * of a Safari tab, and `statusBarStyle: 'default'` keeps the status bar legible on the
   * paper ground rather than painting it over.
   */
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'srsly',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
};

/**
 * The colour the OS paints around the app, and the width it lays out against.
 *
 * `themeColor` matches the manifest's, so the phone's status bar and the app's own accent are
 * one colour rather than two that nearly match. `viewportFit: 'cover'` lets the page reach
 * under a notch, which is what a standalone window is expected to do.
 */
export const viewport: Viewport = {
  themeColor: '#B23A2E',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* `no-page-custom-font` is a PAGES-ROUTER rule: it warns that a font linked from a
            page loads for that page only, and tells you to move it to `pages/_document.js`.
            This is the app router, and this IS the document — the link lives in the single
            root layout, which is exactly what the rule is asking for. There is nowhere
            "better" to move it to, so the warning has no fix. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Hanken+Grotesk:wght@400;500;600&family=Noto+Serif+SC:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;600&family=Spline+Sans+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Inter:wght@400;500;600&family=IBM+Plex+Serif:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Lora:wght@400;500;600&family=Source+Sans+3:wght@400;500;600&family=Playfair+Display:wght@400;500;600&family=Courier+Prime:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full" data-theme="paper" data-font="editorial-warm" suppressHydrationWarning>
        {/* Blocking script: reads saved prefs before first paint to prevent theme/font flash
            and to set <html lang> for the active study language.

            ⚠ IT SETS FIVE ATTRIBUTES, NOT TWO, AND THE OTHER THREE WERE SIMPLY MISSING.
            `useTheme` is the only thing that writes `data-texture`, `data-blank` and
            `data-tones` — and it is called in exactly ONE place, inside `ThemeSheet`'s body,
            which by design does not mount until the drawer has been opened (see its own
            docstring: mounting it eagerly would run a second `useAchievements` on the landing
            path). So a learner who had chosen an earned paper or a blank style got the DEFAULT
            on every load until they happened to open the drawer, at which point it silently
            corrected itself. Theme and font were immune only because this script already
            carried them.

            Found while adding tone colours, which landed in the same hole. The fix belongs
            here rather than in a new root-level `useTheme()` call: this runs before first
            paint, which is the whole reason the script exists, and a hook in `AppShell` would
            apply the attribute a frame late — a flash of the wrong paper, which is the thing
            this script was written to prevent.

            The lang map is GENERATED from LanguageConfig rather than written out here. It
            used to read `if (p.language === 'ja')` and nothing else, so Spanish and French
            learners were served `lang="zh"` until the client mounted and corrected it —
            wrong for screen readers and for the font fallback the browser picks. This is a
            server component, so the config can simply be interpolated in and cannot drift
            from it the way a hand-kept ternary would. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=JSON.parse(localStorage.getItem('srsly-prefs')||'{}');if(p.theme)document.body.setAttribute('data-theme',p.theme);if(p.font)document.body.setAttribute('data-font',p.font);document.body.setAttribute('data-texture',p.texture||'grain');document.body.setAttribute('data-blank',p.blankStyle||'dotted');document.body.setAttribute('data-tones',p.toneColors===true?'on':'off');var L=${JSON.stringify(
          Object.fromEntries(SUPPORTED_LANGUAGES.map(c => [c.code, c.htmlLang])),
        )};if(p.language&&L[p.language])document.documentElement.setAttribute('lang',L[p.language]);}catch(e){}})();` }} />
        {children}
      </body>
    </html>
  );
}
