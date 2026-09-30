import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * AN ARTICLE THE LEARNER ARRIVES WITH HAS TO SURVIVE THE CHOOSER FOLDING ITSELF AWAY.
 *
 * Found by opening a real share link in a browser with a passage already cached for the day,
 * after the identical link had worked perfectly on an empty tab. The sequence:
 *
 *   1. `ReadTab` decodes the hash and clears it — so the only copy of the article is now in
 *      React state.
 *   2. `ReadingSources`' clip effect opens the paste panel with it loaded.
 *   3. The day's cache resolves ASYNCHRONOUSLY, `emptyTab` flips true → false, and the fold
 *      effect re-runs and closes the panel.
 *
 * Nothing errors, nothing is logged, and the hash is already gone: the link simply does
 * nothing. That is the dead-button report this codebase has filed before, arriving through a
 * different door.
 *
 * Pinned against the SOURCE in the shape `tests/readSections.test.ts` uses, because it is
 * component wiring — the failure is a dependency or a guard quietly going missing, and the
 * symptom is silence rather than a wrong value anything can assert. Comments are stripped
 * first for the reason `tests/writingState.test.ts` gives: the files below explain this bug at
 * length and name every identifier being searched for while doing it.
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

const sources = code(read('components/read/ReadingSources.tsx'));
const readTab = code(read('components/read/ReadTab.tsx'));

describe('the fold cannot close a panel holding an unread article', () => {
  it('guards the fold on the clip, and watches it', () => {
    const fold = sources.slice(sources.indexOf('if (!emptyTab'), sources.indexOf('if (!emptyTab') + 140);
    expect(fold).toContain('!clip');
    expect(fold).toMatch(/\[emptyTab,\s*clip\]/);
  });

  /**
   * THE OTHER HALF, AND WITHOUT IT THE GUARD ABOVE IS PERMANENT RATHER THAN CORRECT. Nothing
   * cleared `clip`, though `ReadingSources` had claimed "the clip is cleared once used" in a
   * comment for as long as the clipper has existed. Harmless while no code read the flag; the
   * difference between "do not fold yet" and "never fold again" the moment one did.
   */
  it('clears the clip once it has been committed, so folding resumes', () => {
    const commit = readTab.slice(
      readTab.indexOf('const commitPastedPassage'),
      readTab.indexOf('const generateMore'));
    expect(commit).toContain('setClip(null)');
  });
});

describe('a share is decoded asynchronously, and that is visible in the wiring', () => {
  /**
   * The prefix decides the layout and the payload decides the content, and the split exists
   * because `DecompressionStream` cannot be awaited in a lazy `useState` initialiser. If the
   * status were derived from the decoded clip instead, the first committed frame would show the
   * reading chooser to somebody who had just opened a link to something specific.
   */
  it('decides that a share is INCOMING from the prefix alone, synchronously', () => {
    const init = readTab.slice(
      readTab.indexOf("useState<'none' | 'loading' | 'unreadable'>"),
      readTab.indexOf('const shareHash'));
    expect(init).toContain('sharePrefixPresent');
    expect(init).toContain("'loading'");
    expect(init).not.toContain('decodeShare');
  });

  /**
   * STRICTMODE, WHICH RUNS EVERY EFFECT MOUNT → CLEANUP → MOUNT IN DEVELOPMENT. The hash is
   * cleared immediately, so a second run reading `window.location.hash` finds nothing — the
   * shared article would work in production and vanish on the developer's own machine. The
   * captured hash has to outlive the effect, which means a ref.
   */
  it('captures the hash in a ref so a re-run does not find it already cleared', () => {
    expect(readTab).toContain('const shareHash = useRef<string | null>(null)');
    const effect = readTab.slice(readTab.indexOf('if (shareHash.current === null)'), readTab.indexOf('void decodeShare'));
    expect(effect).toContain('replaceState');
  });

  /** The chooser is told a share is coming, or it renders "pick something to read" at someone
   *  who has just opened a link to something specific. */
  it('tells ReadingSources that a share is still decoding', () => {
    expect(readTab).toContain("pendingShare={shareStatus === 'loading'}");
    expect(sources).toContain('pendingShare');
    expect(sources).toMatch(/useState\(pendingShare\)/);
  });
});

describe('what may be shared', () => {
  /**
   * A BOOK MAY NOT BE, and that is the same promise as "EPUB files never sync": a book is
   * megabytes of somebody else's copyrighted file, and putting a chapter into a chat app is
   * that act by another route. `bookPassage` is non-null exactly while a book is open, so the
   * test is the state rather than a guess about the content.
   */
  it('refuses a book', () => {
    const canShare = readTab.slice(readTab.indexOf('const canShare'), readTab.indexOf('const canShare') + 120);
    expect(canShare).toContain('!bookPassage');
  });

  /** Flattened exactly as `lib/shelf.ts` flattens it — two independent flattenings of one
   *  passage is how a shared copy and a shelved copy come to disagree about spacing. */
  it('builds the shared text the way the shelf does', () => {
    expect(readTab).toContain('SENTENCES.map(s => s.plainText).join(\' \').trim()');
    expect(readTab).toContain('tokensToText(TITLE_TOKENS, langConfig.scriptIsUnspaced)');
  });
});
