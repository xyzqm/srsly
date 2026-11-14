'use client';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import { ensureHandFont } from '@/lib/handFont';

/**
 * CAHIER — the pieces of a school exercise book that Review and Learn are drawn with.
 *
 * ── WHY A NOTEBOOK, AND WHY IT IS NOT DECORATION ──
 * The app was reported as "boring and really AI-looking" twice: once before a structural
 * cleanup and once after it. The second report was the informative one. The layout had been
 * fixed and the look had not, because the look was the default theme itself — cream paper, a
 * serif display face and a terracotta accent, with soft tints and hairlines — which is the
 * single commonest thing a model produces when asked for "tasteful". Nothing on the screen
 * could only have belonged to an app about learning to read four languages.
 *
 * A school exercise book is that thing. It is what every one of these languages is actually
 * learned in, it differs BY LANGUAGE in a way a learner recognises (see `paperRuling` on
 * `LanguageConfig`), and its devices all carry information rather than ornament: a margin
 * holds the numbers, a tick means done, a circle means this one, a highlighter means here.
 *
 * ── THE THEME STILL DRIVES EVERY COLOUR ──
 * Nothing in this file names a colour. The ruling, the margin, the pen, the highlighter and
 * the buttons are all tokens derived in `app/globals.css` from the ten themes' own `--ink`,
 * `--accent`, `--gold` and `--card`, so switching theme in Settings re-inks the whole page —
 * including the three dark ones, where the paper is charcoal and the ruling is a pale line.
 * `tests/cahier.test.ts` computes the contrast of each pairing in every theme.
 *
 * ── TEXTURE GOES ON SURFACES, NEVER ON CONTROLS ──
 * The one way this kind of design goes wrong is kitsch: a button drawn so much like a doodle
 * that nobody knows it can be pressed. So the paper is ruled and the sheets are tilted, and
 * every control is still a plain `<button>` of at least 44px with a hover, a press and a
 * focus ring (`.cahier-btn`, `.cahier-mark`, `.cahier-row`, `.cahier-opt`).
 */

/**
 * The page: ruled in the study language's own school paper, with the margin rule.
 *
 * It keeps the tab panel's existing shape (the rounded corners that join it to the tab bar)
 * and only replaces its padding, because the left padding IS the margin and has to come from
 * the same variable the rule is positioned with.
 */
export function CahierPage({ className = '', style, children }: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const language = useLanguage();
  const cfg = getLanguageConfig(language);

  // In an effect, never during render: it appends a <link> to the document.
  useEffect(() => { ensureHandFont(cfg); }, [cfg]);

  /**
   * `--f-hand` FALLS BACK TO THE DISPLAY FACE, in two different ways. A language with a hand
   * font names it first and the display face second, so the note is readable in the frame
   * before the font arrives. A language without one (Chinese, Japanese) sets nothing at all,
   * and `.cahier-hand` then resolves to the display italic through the variable's own default.
   */
  const hand = cfg.handFont
    ? ({ '--f-hand': `'${cfg.handFont}', var(--f-display)`, '--hand-style': 'normal' } as CSSProperties)
    : undefined;

  return (
    <div className={`cahier-page ${className}`} data-ruling={cfg.paperRuling} style={{ ...style, ...hand }}>
      {children}
    </div>
  );
}

/**
 * The date, written at the top of the page in the language being studied — the first thing a
 * pupil writes on any page, and free: `bcp47` is already on the config for speech.
 *
 * ── MOUNT-GATED, WHICH IS A HYDRATION RULE AND A CLOCK RULE ──
 * This page is prerendered, and a date formatted during render is the server's day in the
 * server's zone. It would mismatch on hydration and, worse, be wrong. A non-breaking space
 * holds the line's height until the client fills it in, so nothing below it moves.
 */
export function CahierDate() {
  const language = useLanguage();
  const cfg = getLanguageConfig(language);
  const [text, setText] = useState(' ');
  useEffect(() => {
    try {
      setText(new Intl.DateTimeFormat(cfg.bcp47, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()));
    } catch { /* a locale this runtime does not know: the line simply stays empty */ }
  }, [cfg.bcp47]);
  return (
    <div className="cahier-hand" lang={cfg.htmlLang}
      style={{ textAlign: 'right', fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink-soft)' }}>
      {text}
    </div>
  );
}

export type PenMarkKind = 'cross' | 'triangle' | 'circle' | 'double' | 'tick' | 'ring';

/**
 * A mark made with the pen. Drawn, not typed: ✗ △ ○ ◎ exist as characters, and as characters
 * they are a different drawing in every font, sit on different baselines and cannot be given
 * a stroke weight — the reason `Mark.tsx` gives for refusing emoji.
 *
 * Each path is deliberately a little off — a circle that overshoots its own start, a triangle
 * whose last stroke misses the first corner — because a perfect circle reads as an icon and
 * an imperfect one reads as a hand.
 *
 * `cross`, `triangle`, `circle` and `double` are the four grades. That scale is the one
 * Japanese schools mark work with (✗ wrong, △ partly, ○ right, ◎ excellent), which maps onto
 * Again / Hard / Good / Easy one for one. It is always shown WITH the word, never instead of
 * it, because the scale is not universal — Chinese schools use ✓ and ✗.
 *
 * They colour themselves from `currentColor`; the caller's CSS sets that to the pen.
 */
export function PenMark({ kind, size = 54, strokeWidth }: { kind: PenMarkKind; size?: number; strokeWidth?: number }) {
  if (kind === 'tick') {
    return (
      <svg width={size} height={size * 0.92} viewBox="0 0 26 24" aria-hidden="true">
        <path d="M4 13 Q8 17 10 21 Q15 9 24 3" fill="none" stroke="currentColor" strokeWidth={strokeWidth ?? 3} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'ring') {
    // Stretched over whatever it circles, so the stroke must not stretch with it.
    return (
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true"
        style={{ position: 'absolute', left: 0, top: 3, width: '100%', height: 'calc(100% - 6px)', pointerEvents: 'none', color: 'var(--cahier-pen)' }}>
        <path d="M52 4 C80 2, 97 12, 96 22 C95 34, 72 41, 46 40 C20 39, 3 32, 4 20 C5 9, 28 3, 62 6"
          fill="none" stroke="currentColor" strokeWidth={strokeWidth ?? 2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  const sw = strokeWidth ?? 3.6;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {kind === 'cross' && (
        <path d="M13 11 Q31 30 53 55 M52 9 Q33 31 10 54" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      )}
      {kind === 'triangle' && (
        <path d="M31 8 L58 54 L6 52 L33 7" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {kind === 'circle' && (
        <path d="M34 7 C50 6, 60 20, 58 34 C56 50, 42 60, 28 58 C12 56, 4 42, 6 28 C8 14, 21 6, 38 9" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      )}
      {kind === 'double' && (
        <>
          <path d="M34 5 C52 4, 62 20, 60 34 C58 52, 42 62, 27 60 C10 58, 2 42, 4 27 C6 12, 20 4, 39 7" fill="none" stroke="currentColor" strokeWidth={sw - 0.2} strokeLinecap="round" />
          <path d="M33 19 C42 18, 47 26, 46 33 C45 42, 38 47, 30 46 C22 45, 17 38, 18 30 C19 23, 25 18, 35 20" fill="none" stroke="currentColor" strokeWidth={sw - 0.4} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** How many marks the tally draws before it says "+N" instead. Eight gates fit a phone. */
export const TALLY_MAX = 40;

/**
 * Cards done this session, as tally marks: four strokes and a fifth across them.
 *
 * ── IT IS A COUNT, SO IT MAY NOT LIE WHEN THE COUNT GETS LARGE ──
 * A tally that silently stops at the edge of the screen is a progress indicator that reads
 * 40 for a learner on their 90th card. Past `TALLY_MAX` it draws the forty and writes the
 * remainder as a number beside them, so marks plus number is always the true total. The exact
 * figure is also printed in words on the same line; this is the part you can see grow.
 *
 * ── ONE FIXED-HEIGHT ROW ──
 * It is rendered at zero too (an empty box of the same height), and it never wraps: a tally
 * that grew a second line on the 41st card would push the flashcard down mid-session, under
 * the thumb that is about to press a grade.
 */
export function Tally({ n }: { n: number }) {
  const shown = Math.max(0, Math.min(n, TALLY_MAX));
  const gates = Math.floor(shown / 5);
  const rest = shown % 5;
  const GATE = 27, STROKE = 6;
  const width = gates * GATE + (rest ? rest * STROKE + 4 : 0);
  let d = '';
  for (let g = 0; g < gates; g++) {
    const x = g * GATE;
    // Four uprights, each leaning a hair differently, and the fifth struck through them.
    d += `M${x + 3} 3 L${x + 4} 20 M${x + 9} 4 L${x + 9} 20 M${x + 15} 3 L${x + 16} 21 M${x + 21} 4 L${x + 21} 20 M${x} 16 L${x + 24} 7 `;
  }
  for (let r = 0; r < rest; r++) {
    const x = gates * GATE + 3 + r * STROKE;
    d += `M${x} ${3 + (r % 2)} L${x + (r % 2 ? 0 : 1)} ${20 + (r % 2)} `;
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, flex: 'none' }}>
      {width > 0 && (
        <svg width={width} height={24} viewBox={`0 0 ${width} 24`} role="img" aria-label={`${n} done`} style={{ flex: 'none' }}>
          <path d={d} fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinecap="round" />
        </svg>
      )}
      {n > TALLY_MAX && (
        <span className="cahier-hand" style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>+{n - TALLY_MAX}</span>
      )}
    </span>
  );
}
