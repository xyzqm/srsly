import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HAN_FONT_HREF } from '@/lib/hanFont';

/**
 * SPLITTING THE FONT STYLESHEET CAN ONLY FAIL ONE WAY: BY LOSING A FAMILY.
 *
 * One render-blocking link naming thirteen families became two — eleven Latin in the document
 * and two Han injected on demand — because the Han pair is 185.6 kB of a 188.8 kB request and
 * every learner was downloading it (see `lib/hanFont.ts` for the measurements). The saving is
 * not in question. What a reviewer cannot see by reading either file is whether some family
 * fell down the gap between them, and the symptom would be one theme quietly rendering in a
 * fallback — invisible until somebody picked that theme.
 *
 * So this test does not pin a list of names, which would just be a third copy to keep in step.
 * It reads the font families `app/globals.css` actually asks for and requires every one of
 * them to be served by one of the two stylesheets. A new theme that names a font nobody
 * fetches fails here rather than on the day it is chosen.
 */

const ROOT = resolve(import.meta.dirname, '..');
const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
const layout = readFileSync(resolve(ROOT, 'app/layout.tsx'), 'utf8');

/** The one `<link>` left in the document head. */
const latinHref = (layout.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"'\s]+/g) ?? [])[0] ?? '';

/** `family=Noto+Serif+SC:wght@...` → `Noto Serif SC` */
function families(href: string): Set<string> {
  return new Set(
    [...href.matchAll(/family=([^:&]+)/g)].map(m => decodeURIComponent(m[1]).replace(/\+/g, ' ')),
  );
}

const latin = families(latinHref);
const han = families(HAN_FONT_HREF);
const fetched = new Set([...latin, ...han]);

/**
 * Every quoted font name in the stylesheet's own custom properties. Generic keywords (`serif`,
 * `monospace`) are the FALLBACKS and are deliberately unquoted in `globals.css`, so quoting is
 * what separates "a font we must fetch" from "whatever the device has".
 */
const wanted = new Set(
  [...css.matchAll(/--f-(?:display|mono|han|body|ui)\s*:\s*([^;]+);/g)]
    .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(q => q[1])),
);

describe('the split font stylesheet still serves every font the themes name', () => {
  it('found both halves and the themes to check them against', () => {
    // A vacuous pass is this suite's own worst failure mode — see tests/aiGate.test.ts, where
    // a renamed directory switched the whole check off while still reporting green.
    expect(latinHref).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/);
    expect(latin.size).toBeGreaterThanOrEqual(10);
    expect(han.size).toBe(2);
    expect(wanted.size).toBeGreaterThanOrEqual(10);
  });

  it.each([...wanted])('%s is fetched by one of the two stylesheets', name => {
    expect(fetched.has(name)).toBe(true);
  });

  it('the document head no longer blocks on a Han family', () => {
    // The entire point. 185.6 kB of 188.8 kB was these two, and a stylesheet blocks rendering.
    for (const h of han) expect(latin.has(h)).toBe(false);
    expect(latinHref).not.toMatch(/Noto\+(Serif|Sans)\+SC/);
  });

  it('the two halves are disjoint, so nothing is downloaded twice', () => {
    for (const f of latin) expect(han.has(f)).toBe(false);
  });

  it('both halves still ask for display=swap', () => {
    // Without it the browser hides text while the font loads, which on the Han half would
    // reintroduce exactly the blank-first-paint this change exists to remove.
    expect(latinHref).toContain('display=swap');
    expect(HAN_FONT_HREF).toContain('display=swap');
  });
});
