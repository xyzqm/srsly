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

  /**
   * THE CONTROL, AND IT GOT SHARPER WHEN THE TAB BECAME REMEMBERED.
   *
   * It used to assert the literal `decodeClip(...) ? 'read' : 'practice'`, which was the whole
   * of `initialTab`. Now that a reload restores the tab you were on, there is a second thing a
   * clip has to beat: a stored `vocab` must not be restored over the top of an incoming
   * article, because ReadTab's effect would never mount and the clip would be silently lost.
   * So the assertion is about ORDER — the clip is answered before anything is read back — which
   * is the property, where the old one was the spelling.
   */
  it('lets a clip win the landing tab over the remembered one', () => {
    const fn = page.slice(page.indexOf('function initialTab'), page.indexOf('function AppShell'));
    expect(fn).toContain("return 'read'");
    expect(fn.indexOf('decodeClip')).toBeLessThan(fn.indexOf('storedTab'));
  });

  /** And a reload with no clip returns you where you were. */
  it('restores the tab you were on', () => {
    expect(page).toContain("localStorage.setItem(TAB_KEY, next)");
    expect(page).toMatch(/storedTab\(\)\s*\?\?\s*'dash'/);
  });
});

describe('Home is the front door', () => {
  /**
   * The default was `practice`, which opens straight into a flashcard with no context — fine
   * once you know the app, a strange first screen for anyone who does not. Home answers what
   * you owe today and what the two options are.
   */
  it('lands a first-time visitor on Home', () => {
    expect(page).toMatch(/storedTab\(\)\s*\?\?\s*'dash'/);
  });

  it('puts Home first in the tab bar', () => {
    const first = tabNav.match(/const TABS[^=]*=\s*\[\s*\{\s*id:\s*'(\w+)',\s*label:\s*'(\w+)'/);
    expect(first?.[1]).toBe('dash');
    expect(first?.[2]).toBe('Home');
  });

  /**
   * ONE PLACE ANSWERS "what now". Stats offered "Open today's passage", Vocab offered "Study",
   * and nothing offered Read — three navigation controls grown on three content pages, each
   * picking whichever destination that page happened to be about. Home offers both real
   * options; a fourth opinion elsewhere is what this forbids.
   */
  it('keeps the two actions on Home and nowhere else', () => {
    const stats = code(read('components/stats/StatsTab.tsx'));
    expect(stats).toContain('onNavigateRead');
    expect(stats).toContain('onNavigateReview');
    expect(code(read('components/vocab/VocabTab.tsx'))).not.toContain('onStudy');
  });

  /**
   * AND IT DOES NOT OPEN ON A WALL OF ZEROS. CLAUDE.md's reason for `seed:dev` is that Stats
   * hides itself on a new account, "because a wall of empty progress bars is a list of things
   * you have failed to do" — which making it the landing tab would have walked straight into.
   */
  it('gives an empty deck a sentence rather than zeros', () => {
    const stats = code(read('components/stats/StatsTab.tsx'));
    expect(stats).toMatch(/deckLoaded && deck\.length === 0/);
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
