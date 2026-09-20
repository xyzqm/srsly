import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * WHERE GENERATION LIVES, AND WHAT MOVED WITH IT.
 *
 * The generated passage used to sit in the drill tab, on the reasoning that it is written
 * around the words you owe today and therefore belongs with scheduled work. That is true about
 * the PASSAGE and was wrong about the TAB: a learner looking for "write me something to read"
 * looks under Read, found two cards about pasting and uploading, and reported the feature as
 * missing. It was reported twice.
 *
 * Pinned against the SOURCE, in the shape `tests/accountRoutes.test.ts` uses, because all of
 * this is component wiring: the failure mode is a prop or an import quietly coming back, and
 * the symptom is a feature in the wrong place rather than a wrong value anything can assert.
 * Comments are stripped first for the reason `tests/writingState.test.ts` gives — these files
 * explain the move at length and name the very identifiers being searched for.
 */

const ROOT = resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');
}

const sections = code(read('components/read/ReadSections.tsx'));
const srsTab = code(read('components/practice/SrsTab.tsx'));
const tabNav = code(read('components/TabNav.tsx'));
const page = code(read('app/page.tsx'));

describe('the generated passage lives in the Read tab', () => {
  it('offers both kinds of reading from one place', () => {
    expect(sections).toMatch(/variant="srs"/);
    expect(sections).toMatch(/variant="read"/);
  });

  /** The drill tab is drills. A ReadTab coming back here is the move being undone. */
  it('is gone from the drill tab', () => {
    expect(srsTab).not.toContain('ReadTab');
  });

  it('is mounted by the Read tab and not by the drill tab', () => {
    expect(page).toContain('ReadSections');
    expect(page).not.toMatch(/<ReadTab\b/);
  });
});

describe('two sections, not one merged list', () => {
  /**
   * They keep their own lists and their own controls. A generated passage has blanks, a hints
   * toggle, a dictation run and a results screen; a pasted article has none of them, so one
   * merged list would walk "passage 3 of 9" between two kinds of thing whose controls appear
   * and disappear as you page — the tangle that gave a book its own reading space.
   */
  it('keeps each section mounted in its own panel', () => {
    expect(sections.match(/<TabPanel/g) ?? []).toHaveLength(2);
  });

  /**
   * A HIDDEN SECTION STILL HEARS `window`. `display: none` stops focus and paint, not a global
   * listener — so a passage player or a dictation run in the section you left would go on
   * speaking over the one you are looking at. The panel has to be TOLD it is off screen.
   */
  it('tells a hidden section that it is hidden', () => {
    expect(sections).toMatch(/active=\{active && section === 'generated'\}/);
    expect(sections).toMatch(/active=\{active && section === 'library'\}/);
  });
});

describe('a clip still reaches the thing that reads it', () => {
  /**
   * `TabPanel` mounts a section only once activated, and the clipper reads the location hash
   * in an effect inside the LIBRARY section. Defaulting to Generated with a clip in the URL
   * would leave that effect unmounted and the article silently unread — the same trap
   * `initialTab()` documents one level up, reintroduced by adding a level.
   */
  it('opens the library section when the URL carries one', () => {
    expect(sections).toContain('decodeClip');
    const init = sections.slice(sections.indexOf('useState<Section>'), sections.indexOf('return ('));
    expect(init).toMatch(/decodeClip[\s\S]*?'library'/);
  });

  /** The control: Read still wins the landing tab for a clip, which is what gets us this far. */
  it('still lands on Read rather than the drill tab', () => {
    expect(page).toMatch(/decodeClip\([\s\S]{0,40}\)\s*\?\s*'read'\s*:\s*'practice'/);
  });
});

describe('the drill tab is called Review', () => {
  it('says Review on the tab bar', () => {
    expect(tabNav).toMatch(/id:\s*'practice',\s*label:\s*'Review'/);
  });

  /**
   * THE ID AND THE COLUMN DO NOT MOVE. `TabId` is already `practice` and the synced column is
   * `srs_state`; both name the SCHEDULER, which did not change. Renaming a synced column to
   * match a label is a migration bought with nothing, and this test is what stops a later pass
   * "finishing the rename".
   */
  it('renames the label and not the id', () => {
    expect(tabNav).toContain("id: 'practice'");
    expect(code(read('lib/types.ts'))).toMatch(/'practice'/);
  });
});
