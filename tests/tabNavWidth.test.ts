/**
 * THE TAB STRIP MAY SCROLL; THE PAGE MAY NOT.
 *
 * `.app-frame` is a flex COLUMN — `globals.css` made it one so that switching tabs could not
 * move the footer. A flex item normally stretches to the container's cross size, but an AUTO
 * MARGIN on the cross axis disables stretch, and this nav carries `mx-auto`. Without an
 * explicit `w-full` it therefore shrank to fit its own content, measured **458px inside a
 * 375px viewport**, and the 84px spilled out as horizontal scroll on the whole document —
 * header, card and all — on every phone.
 *
 * The irony is the part worth pinning: the row inside is `overflow-x-auto` precisely so that
 * six tabs scroll WITHIN the page on a narrow screen. An unconstrained parent means there is
 * nothing for it to overflow, so the scroller silently does nothing and the page scrolls
 * instead. The two classes are ONE FACT in two places, which is why both are asserted
 * together — removing either alone reproduces the bug.
 *
 * Source-based, and comments are stripped first for the reason `tests/accountRoutes.test.ts`
 * gives at length: the comment this test exists to protect names `w-full` five times while
 * explaining it, so a raw substring check would pass on the documentation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');
}

const root = resolve(__dirname, '..');
const nav = code(readFileSync(resolve(root, 'components/TabNav.tsx'), 'utf8'));
const navTag = nav.match(/<nav className="([^"]*)"/)?.[1] ?? '';

describe('the tab nav cannot scroll the page sideways', () => {
  it('renders a <nav> with a class list at all', () => {
    expect(navTag, 'no <nav className="…"> found — the shape this test reads has changed')
      .not.toBe('');
  });

  it('pins its width rather than shrinking to its tabs', () => {
    // The whole bug, in one class. `mx-auto` without it is shrink-to-fit on a flex column.
    expect(navTag.split(/\s+/)).toContain('w-full');
  });

  it('still centres and caps its width, so the fix did not just remove mx-auto', () => {
    // Dropping `mx-auto` would also have stopped the overflow — by left-aligning the tab row
    // against a 1200px page while `main` below it stayed centred. The control for "did you
    // fix it or delete it".
    expect(navTag).toContain('mx-auto');
    expect(navTag).toMatch(/max-w-\[\d+px\]/);
  });

  it('keeps the inner row scrollable, which is what makes six tabs fit', () => {
    expect(nav).toMatch(/overflow-x-auto/);
  });

  it('matches how <main> in the same frame already does it', () => {
    // `main` has carried all three classes together since before this was noticed, and is
    // measured correct at 375px. It is the worked example, so it is asserted as one.
    const page = code(readFileSync(resolve(root, 'app/page.tsx'), 'utf8'));
    const mainTag = page.match(/<main className="([^"]*)"/)?.[1] ?? '';
    for (const cls of ['w-full', 'mx-auto']) expect(mainTag.split(/\s+/)).toContain(cls);
  });
});
