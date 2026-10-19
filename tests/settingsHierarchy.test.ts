/**
 * A SECTION HEADING MUST OUT-RANK THE TEXT IT HEADS.
 *
 * `SectionLabel` was 10.5px in `--ink-faint`, sitting directly above 13.5px `--ink-soft`
 * prose — SMALLER and FAINTER than the paragraph it introduced. The one element whose entire
 * job is to be findable while scrolling was the least prominent thing in its own section, so
 * the four Settings groups could not be scanned by their headings. Measured in the Studying
 * group: three sections over 1,761px with 716 of them between the first heading and the
 * second.
 *
 * The rule being pinned is NOT "uppercase mono looks nice" — that is the app's register and is
 * not in question. It is the RANKING, against the body style that actually sits beneath it, so
 * a later tidy-up cannot quietly invert it again by nudging one number.
 *
 * Source-based, comments stripped, for the reason `tests/accountRoutes.test.ts` gives: the
 * docstring this test protects quotes the old sizes and colours while explaining them, so a
 * raw substring check would pass on the documentation.
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

const SRC = code(readFileSync(
  resolve(__dirname, '../components/settings/SettingsTab.tsx'), 'utf8'));

/** The `SectionLabel` function body, which is where the heading style lives. */
const label = SRC.slice(SRC.indexOf('function SectionLabel'), SRC.indexOf('interface Props'));

/** Every inline `fontSize: n` in the file, as numbers. */
const sizes = [...SRC.matchAll(/fontSize:\s*([\d.]+)/g)].map(m => Number(m[1]));

describe('the Settings section heading', () => {
  it('is still found where this test expects it', () => {
    // Guards against a vacuous pass if the component is renamed or moved.
    expect(label).toContain('fontSize');
    expect(label).toContain('textTransform');
  });

  const headingSize = Number(label.match(/fontSize:\s*([\d.]+)/)?.[1]);

  it('is at least as large as the body prose it introduces', () => {
    // 13.5 is the paragraph style used throughout these groups. The heading used to be 10.5.
    expect(headingSize).toBeGreaterThanOrEqual(11);
  });

  it('is not the faintest thing in its own section', () => {
    // `--ink-faint` is the colour of captions and hints — the things that RECEDE. A heading
    // using it is claiming to be less important than the paragraph under it.
    expect(label).not.toContain('--ink-faint');
    expect(label).toMatch(/--ink-soft|--ink\b/);
  });

  it('keeps the app\'s own register rather than becoming a generic heading', () => {
    // The fix is the ranking, not the voice. Mono, uppercase and wide tracking stay.
    expect(label).toContain('var(--f-mono)');
    expect(label).toContain("textTransform: 'uppercase'");
    expect(label).toMatch(/letterSpacing/);
  });

  it('separates sections with a rule, except the first in a group', () => {
    // A divider above the first heading separates it from nothing — the group chips are
    // already there. The `first` escape hatch is what keeps that from being a hardcoded list.
    expect(label).toContain('borderTop');
    expect(label).toMatch(/first/);
    expect(SRC).toMatch(/<SectionLabel first>/);
  });

  it('does not shout louder than the tab\'s own title', () => {
    // The control in the other direction: a section heading that out-ranks the page title
    // would flatten the hierarchy from the top instead of the bottom.
    expect(headingSize).toBeLessThan(Math.max(...sizes));
  });
});
