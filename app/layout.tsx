import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'srsly?',
  description: 'Spaced repetition Chinese learning',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Hanken+Grotesk:wght@400;500;600&family=Noto+Serif+SC:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;600&family=Spline+Sans+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Inter:wght@400;500;600&family=IBM+Plex+Serif:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Lora:wght@400;500;600&family=Source+Sans+3:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full" data-theme="paper" data-font="editorial-warm" suppressHydrationWarning>
        {/* Blocking script: reads saved prefs before first paint to prevent theme/font flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=JSON.parse(localStorage.getItem('srsly-prefs')||'{}');if(p.theme)document.body.setAttribute('data-theme',p.theme);if(p.font)document.body.setAttribute('data-font',p.font);}catch(e){}})();` }} />
        {children}
      </body>
    </html>
  );
}
