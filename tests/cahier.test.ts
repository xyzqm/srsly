import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUPPORTED_LANGUAGES } from '@/lib/languageConfig';
import { handFontHref } from '@/lib/handFont';

/**
 * THE NOTEBOOK HAS TO BE READABLE IN ALL TEN THEMES, AND NOBODY LOOKS AT ALL TEN.
 *
 * Review and Learn are drawn as a school exercise book (`components/shared/Cahier.tsx`), and
 * every colour on that page is DERIVED from a theme's tokens in `app/globals.css` — the ruling
 * is a share of `--ink`, the sticky note a share of `--gold`, the button the accent. That is
 * what lets a learner change theme and have the whole page re-ink itself; it is also ten
 * palettes times eight pairings that no screenshot review will ever cover.
 *
 * So this computes them. It reads the theme blocks and the cahier block out of the real
 * stylesheet, mixes the colours the way `color-mix(in srgb, …)` does, and holds each pairing
 * to the contrast its job needs:
 *
 *   - the RULING must be faint (it sits under titles that are read for an hour) and must
 *     still be there, which is a band rather than a floor;
 *   - TEXT needs 4.5:1, including the small pen-coloured notes;
 *   - a DRAWN MARK needs 3:1.
 *
 * ── IT FOUND ONE THAT HAD ALREADY SHIPPED ──
 * The primary buttons were `#fff` on `--accent`. Measured the same way, that is 1.74:1 on the
 * terminal theme, 2.83 on midnight and 3.08 on dusk — a white label on a pale button, in
 * production, on three themes. The mapping this file pins exists because of that number.
 *
 * The percentages are PARSED from the stylesheet rather than repeated here, so retuning the
 * ruling changes what is tested instead of leaving a stale copy that still passes.
 */

const css = readFileSync(resolve(import.meta.dirname, '..', 'app/globals.css'), 'utf8');

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  let s = h.slice(1);
  if (s.length === 3) s = [...s].map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) as RGB;
};
const lum = (c: RGB) => {
  const [r, g, b] = c.map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: RGB, b: RGB) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
/** `share` of `top` laid over `under` — what `color-mix(in srgb, top N%, transparent)` paints. */
const over = (top: RGB, under: RGB, share: number): RGB => top.map((v, i) => Math.round(v * share + under[i] * (1 - share))) as RGB;

/** Every theme's hex tokens, first definition wins (the tone rules further down are not themes). */
const themes: Record<string, Record<string, RGB>> = {};
for (const m of css.matchAll(/(?::root,\s*)?\[data-theme="([a-z]+)"\]\s*\{([^}]*)\}/g)) {
  if (themes[m[1]] || !m[2].includes('--paper:')) continue;
  const t: Record<string, RGB> = {};
  for (const v of m[2].matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{3,6})\b/g)) t[v[1]] = hex(v[2]);
  themes[m[1]] = t;
}

const base = css.match(/\n\.cahier-page \{([^}]*)\}/)?.[1] ?? '';
const darkRule = css.match(/((?:body\[data-theme="[a-z]+"\] \.cahier-page,?\s*)+)\{([^}]*)\}/);
const darkNames = [...(darkRule?.[1] ?? '').matchAll(/data-theme="([a-z]+)"/g)].map(m => m[1]);
const dark = darkRule?.[2] ?? '';

/** The share in `--cahier-<name>: color-mix(in srgb, var(--token) N% …)`. */
const share = (block: string, name: string): number | null => {
  const m = block.match(new RegExp(`--cahier-${name}:\\s*color-mix\\(in srgb, var\\(--[a-z-]+\\) (\\d+)%`));
  return m ? Number(m[1]) / 100 : null;
};
const token = (block: string, name: string): string | null =>
  block.match(new RegExp(`--cahier-${name}:\\s*var\\(--([a-z-]+)\\)`))?.[1] ?? null;

describe('the cahier page, computed in every theme', () => {
  it('found the stylesheet it is about', () => {
    // A vacuous pass is this suite's own worst failure mode (tests/aiGate.test.ts).
    expect(Object.keys(themes)).toHaveLength(10);
    expect(share(base, 'rule')).not.toBeNull();
    expect(share(base, 'sticky')).not.toBeNull();
    expect(share(base, 'hilite')).not.toBeNull();
    expect(token(base, 'pen-strong')).toBe('accent-deep');
    expect(darkNames.length).toBeGreaterThan(0);
  });

  it('treats exactly the dark-paper themes as dark', () => {
    // Nothing in a theme says "I am dark", so the stylesheet lists them by name — and a list
    // kept by hand is how an eleventh theme ships with a pale button and a loud grid. This
    // derives the same list from the paper's own luminance.
    const actuallyDark = Object.keys(themes).filter(n => lum(themes[n].paper) < 0.18).sort();
    expect([...darkNames].sort()).toEqual(actuallyDark);
  });

  describe.each(Object.keys(themes))('%s', name => {
    const t = themes[name];
    const isDark = darkNames.includes(name);
    const pick = (n: string) => (isDark ? share(dark, n) : null) ?? share(base, n)!;
    const penStrong = t[(isDark ? token(dark, 'pen-strong') : null) ?? token(base, 'pen-strong')!];
    const btnFg = t[(isDark ? token(dark, 'btn-fg') : null) ?? token(base, 'btn-fg')!];
    const sticky = over(t.gold, t.card, pick('sticky'));
    const hilite = over(t.gold, t.card, pick('hilite'));

    it('rules the paper faintly — visible, and never competing with the writing', () => {
      const c = contrast(over(t.ink, t.card, pick('rule')), t.card);
      expect(c).toBeGreaterThan(1.12);
      expect(c).toBeLessThan(1.4);
    });

    it('writes in ink that reads: 4.5:1 for body and for secondary text', () => {
      expect(contrast(t.ink, t.card)).toBeGreaterThanOrEqual(7);
      expect(contrast(t['ink-soft'], t.card)).toBeGreaterThanOrEqual(4.5);
    });

    it('draws pen marks at 3:1 and writes pen-coloured notes at 4.5:1', () => {
      expect(contrast(t.accent, t.card)).toBeGreaterThanOrEqual(3);
      expect(contrast(penStrong, t.card)).toBeGreaterThanOrEqual(4.5);
    });

    it('labels the primary button at 4.5:1', () => {
      expect(contrast(btnFg, penStrong)).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps the sticky note and the highlighter under readable ink', () => {
      expect(contrast(t.ink, sticky)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.ink, hilite)).toBeGreaterThanOrEqual(4.5);
      // The Continue button sits ON the note, so it has to stand off it as a shape.
      expect(contrast(penStrong, sticky)).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('the sticky note is written in full ink', () => {
  it('sets nothing on the note in --ink-soft', () => {
    // MEASURED, WHICH IS WHY IT IS A RULE: the soft ink on the note's tint came out at 4.39:1
    // on vellum, 4.43 on midnight and 4.50 on dusk — under the line on three themes, by an
    // amount no eye would catch. Grey on a tinted surface is the pairing that fails, so the
    // note may not use it at all; this reads the component rather than trusting that.
    const src = readFileSync(resolve(import.meta.dirname, '..', 'components/learn/LearnTab.tsx'), 'utf8');
    // From the note's own element, not from the heading comment above it — a slice that begins
    // inside that comment has lost its opening `/*` and cannot be stripped.
    const a = src.indexOf('className="cahier-sheet', src.indexOf('THE CONTINUE NOTE'));
    const b = src.indexOf('NO `gap` and no rules between rows');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    // Comments name the token while explaining the rule; only the markup is checked.
    const markup = src.slice(a, b).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(markup).toContain('cahier-sticky');
    expect(markup).not.toContain('--ink-soft');
    expect(markup).not.toContain('--ink-faint');
  });

  it.each(Object.keys(themes))('soft ink on the note really would fail somewhere (control, %s)', () => {
    // The control: if every theme passed with the soft ink, the rule above would be superstition.
    const worst = Math.min(...Object.keys(themes).map(n => {
      const t = themes[n];
      const s = (darkNames.includes(n) ? share(dark, 'sticky') : null) ?? share(base, 'sticky')!;
      return contrast(t['ink-soft'], over(t.gold, t.card, s));
    }));
    expect(worst).toBeLessThan(4.5);
  });
});

describe('one ruling per language', () => {
  const drawn = [...css.matchAll(/\.cahier-page\[data-ruling="([a-z]+)"\]/g)].map(m => m[1]);

  it.each(SUPPORTED_LANGUAGES.map(c => [c.code, c.paperRuling] as const))('%s is ruled as %s, and that ruling is drawn', (_code, ruling) => {
    // A `data-ruling` no rule matches is a page with a margin and no lines — the same silent
    // nothing as a `data-theme` no block matches, which tests/cosmetics.test.ts pins.
    expect(drawn).toContain(ruling);
  });

  it('draws no ruling that no language uses', () => {
    const used = new Set(SUPPORTED_LANGUAGES.map(c => c.paperRuling));
    for (const r of drawn) expect(used.has(r as never)).toBe(true);
  });

  it('gives no Han-script language a handwriting webfont', () => {
    // A Han face is hundreds of unicode-range subsets: the 185 kB stylesheet lib/hanFont.ts
    // exists to keep off the page. A hand font for Chinese would buy a second one.
    for (const c of SUPPORTED_LANGUAGES) if (c.scriptIsUnspaced) expect(c.handFont).toBeUndefined();
  });

  it('builds the hand font address from the family name itself', () => {
    expect(handFontHref('Playwrite FR Moderne'))
      .toBe('https://fonts.googleapis.com/css2?family=Playwrite+FR+Moderne:wght@100..400&display=swap');
  });
});
