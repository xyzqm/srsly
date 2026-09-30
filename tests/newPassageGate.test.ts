import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * WHY "+ NEW PASSAGE" IS OFF HAS TO BE THE REASON IT IS ACTUALLY OFF.
 *
 * The disabled flag tested four conditions and the tooltip offered two sentences, so three
 * different causes all rendered as "Fill in every blank in every passage to unlock a new one".
 * Two of them cannot be acted on by filling anything: pressing Finish is a different action,
 * and a generated passage that rendered NO blanks leaves nothing on screen to fill at all.
 *
 * Found in the field rather than by reading: the 2026-09-29 Groq sweep stopped after three
 * passages, logging `{"step":"disabled","title":"Fill in every blank in every passage…"}` on a
 * run whose last two passages had `"blanks":0`. Replaying that run's saved passages through the
 * real `clozeKey` gives `needed` counts of 4, 4 and 6 — so the gate wanted blanks the renderer
 * had never drawn, and the instruction could not be followed by anybody.
 *
 * Pinned against the SOURCE in the shape `tests/readSections.test.ts` uses, because this is
 * component wiring and the failure is a condition list quietly growing a second copy. Comments
 * are stripped first for the reason `tests/writingState.test.ts` gives: the file quotes the old
 * sentence while explaining it.
 */

const ROOT = resolve(import.meta.dirname, '..');
const raw = readFileSync(resolve(ROOT, 'components/read/ReadTab.tsx'), 'utf8');

const readTab = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .split('\n')
  .filter(l => !l.trim().startsWith('//'))
  .join('\n');

describe('one list of reasons, not two', () => {
  /**
   * THE DRIFT IS THE BUG, so the test is about the shape rather than the wording. A flag
   * computed from its own copy of the conditions is free to disagree with the sentence that
   * explains it, which is exactly what happened.
   */
  it('derives the disabled flag FROM the reason', () => {
    expect(readTab).toMatch(/const newPassageDisabled = loadingMore \|\| blockedReason !== null;/);
  });

  it('renders the reason rather than re-deriving one', () => {
    expect(readTab).toMatch(/title=\{loadingMore \? undefined : blockedReason \?\? undefined\}/);
  });

  /**
   * The sentence that could not be followed is gone from the CODE. Checked against the
   * comment-stripped source and not the raw file, because the explanation above the fix quotes
   * the old wording — the trap `tests/writingState.test.ts` names, met immediately: the first
   * version of this assertion failed on the paragraph describing the bug it was written for.
   */
  it('no longer tells anyone to fill every blank in every passage', () => {
    expect(readTab).not.toContain('Fill in every blank in every passage');
    expect(raw).toContain('Fill in every blank in every passage');   // the control: it survives as prose
  });
});

describe('each cause says its own name', () => {
  const reason = readTab.slice(
    readTab.indexOf('const blockedReason'),
    readTab.indexOf('const newPassageDisabled'));

  it.each([
    ['nothing is due',            'dueDeckWords.size === 0',            'add more in Vocab'],
    ['blanks are unfilled',       'clozeIncomplete',                    'Fill the remaining'],
    ['this passage needs Finish', 'clozeWordCount > 0 && !alreadyFinished', 'Press Finish on this passage first'],
    ['an earlier one is open',    '!allPassagesComplete',               'page back to it'],
  ])('%s', (_name, condition, message) => {
    expect(reason).toContain(condition);
    expect(reason).toContain(message);
  });

  /**
   * FOUR CONDITIONS, FOUR DIFFERENT SENTENCES. Without this the list could be refactored back
   * into one shared string and every assertion above would still pass.
   */
  it('gives four distinct messages', () => {
    const messages = [...reason.matchAll(/'([^']{20,})'|`([^`]{20,})`/g)].map(m => m[1] ?? m[2]);
    expect(new Set(messages).size).toBe(4);
  });
});

describe('the passage on screen is counted by what was drawn', () => {
  /**
   * `needed` is `vocabWords ∩ dueDeckWords`; the renderer uses `selectClozeTargets`, which also
   * applies the daily new-card budget and the blank density. Where the two disagree the gate
   * can demand blanks that do not exist. The current passage uses the renderer's own number —
   * the rule this codebase already states for the Home tab's due count.
   */
  it('compares grades against clozeWordCount for the current passage', () => {
    expect(readTab).toContain('if (isCurrent) return clozeGrades.size >= clozeWordCount;');
  });

  /** A memo that does not watch the number it reads goes stale silently. */
  it('watches clozeWordCount', () => {
    expect(readTab).toMatch(/\[dailyContent, contentKey, passageIdx, clozeGrades, dueDeckWords, clozeWordCount\]/);
  });
});
