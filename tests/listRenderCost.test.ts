/**
 * THE DECK LIST IS THE ONE UNBOUNDED LIST IN THE APP, AND IT WAS QUADRATIC.
 *
 * `VocabTab` renders one row per word with no cap, which is the right product answer — a cap
 * would mean the deck list stops being the deck, and this repo already records that "a filter
 * on a list of answers is part of the answer". What it cannot afford is for each of those rows
 * to cost a scan of the whole deck.
 *
 * Every row used to resolve its own position with `deck.findIndex(d => d.id === w.id)`, inside
 * the row map — so drawing the list was O(n²): ~20,000 id comparisons for a 201-row deck and
 * ~147,000 for the 542-word deck this file names elsewhere, on the main thread, in render.
 * Measured at 4× CPU throttling (about a mid-range phone), against a 52,912px list:
 *
 *     first open   648ms to settle, 369ms BLOCKING, long tasks 131/251/52/135
 *     revisit      312ms,           144ms blocking, one 194ms long task
 *     after        315ms /  73ms  ·  132ms / 0ms, no long task at all on revisit
 *
 * Two rules are pinned here, and each is the kind that regresses silently — the list keeps
 * working, it just gets slow again, and nothing on screen says so.
 *
 * Source-based with comments stripped, for the reason `tests/settingsHierarchy.test.ts` gives:
 * the docstrings these tests protect quote the very code being searched for while explaining
 * why it is gone, so a raw substring check would pass on the documentation.
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

const vocab = code(readFileSync(resolve(__dirname, '../components/vocab/VocabTab.tsx'), 'utf8'));
const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

describe('the deck list does not scan the deck once per row', () => {
  /**
   * The control for this whole file: if the row map is ever renamed or restructured, these
   * assertions could pass by looking at nothing at all.
   */
  it('still renders a row per visible word', () => {
    expect(vocab).toContain('visibleDeck.map(');
    expect(vocab).toContain('deck-row-slot');
  });

  it('resolves a row index through a map, not findIndex', () => {
    expect(vocab).toContain('indexById');
    // The exact quadratic call, in any spacing. A `findIndex` elsewhere in the file is fine;
    // this is specifically the one that looked a word up by id.
    expect(vocab.replace(/\s+/g, '')).not.toContain('deck.findIndex(d=>d.id===w.id)');
  });

  it('builds that map once per deck rather than per render', () => {
    const m = vocab.match(/const indexById = useMemo\(\(\) => \{[\s\S]*?\}, \[([^\]]*)\]\)/);
    expect(m).not.toBeNull();
    // Keyed on the deck alone: adding a dependency that changes per row or per keystroke
    // would rebuild it that often and give the cost straight back.
    expect(m![1].trim()).toBe('deck');
  });

  it('keeps every word in the DOM, so search and find-in-page still reach it', () => {
    // The tempting fix is a cap plus a "show more". It is refused deliberately: a word you
    // have not scrolled to must still be findable, which a sliced list cannot promise.
    expect(vocab).not.toMatch(/visibleDeck\s*\.\s*slice\(/);
  });
});

describe('an off-screen deck row costs nothing to lay out', () => {
  const rule = css.match(/\.deck-row-slot\s*\{([^}]*)\}/);

  it('declares the slot', () => {
    expect(rule).not.toBeNull();
  });

  it('skips off-screen rows', () => {
    expect(rule![1]).toMatch(/content-visibility:\s*auto/);
  });

  /**
   * BOTH HALVES OR NEITHER. `content-visibility: auto` with no intrinsic size gives every
   * unrendered row a height of ZERO — so a 53,000px list collapses, the scrollbar is a stub,
   * and it lurches as rows materialise under the thumb. Measured: the estimate lands within
   * 2px of a real row (98 against 96), and `auto` means the browser remembers the true height
   * after a row has been rendered once, so the number only matters on the first scroll past.
   */
  it('also reserves a height for a row it has not drawn yet', () => {
    expect(rule![1]).toMatch(/contain-intrinsic-size:\s*auto\s+\d/);
  });
});
