/**
 * THE FLASHCARD MAY NOT SPEAK FSRS.
 *
 * Two defects shipped side by side on the card's status chips, and both are the kind that
 * creep back because they read as "showing more information":
 *
 *  1. `S=20.0d · D=5.2` — the scheduler's own variable names, in front of a learner. Exactly
 *     the "term of art, precise to somebody who already knows the system and meaningless to
 *     everybody else" that renamed this tab from SRS to Review.
 *  2. `mature` derived from `reviews >= 5 && lapses === 0`, which is the test
 *     `MASTERY_STABILITY_DAYS` exists to refuse in as many words. The flashcard called a card
 *     mature while the milestone cabinet did not count it as held and the Vocab row drew two
 *     segments of three — two screens disagreeing about one card, two taps apart.
 *
 * Comments are stripped first, and here that is not a formality: the docstring protecting this
 * quotes `S=`, `D=` and the old review-count test verbatim while explaining them, so a raw
 * substring check would fail on its own documentation and push the next person to delete the
 * explanation to get CI green — the reason `tests/writingState.test.ts` gives.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function code(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')   // JSX comment blocks
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');
}

const SRC = code(readFileSync(
  resolve(__dirname, '../components/practice/Flashcards.tsx'), 'utf8'));

describe('the card\'s status chips', () => {
  it('is reading the component this test expects', () => {
    // Vacuity guard: a rename would otherwise make every assertion below trivially true.
    expect(SRC).toContain('reviewed {card.reviews');
  });

  it('never prints the scheduler\'s variable names', () => {
    expect(SRC).not.toMatch(/S=\{/);
    expect(SRC).not.toMatch(/D=\{/);
  });

  it('says what stability MEANS instead', () => {
    // Stability has a plain-English reading — days until recall falls to ~90% — and `fmtDays`
    // already writes it that way for the retention panel.
    expect(SRC).toContain('fmtDays');
  });

  it('does not translate DIFFICULTY, because there is no honest sentence for it', () => {
    // An FSRS parameter on a 1–10 scale with no meaning outside the scheduler's arithmetic.
    // Dropping it is the decision; inventing "quite hard" would be a confident label this
    // codebase cannot support.
    expect(SRC).not.toContain('card.difficulty');
  });

  it('derives "held" from the one shared definition, not from a review count', () => {
    expect(SRC).toContain('cardStage(card)');
    // The control: the old test, which `MASTERY_STABILITY_DAYS` exists to refuse.
    expect(SRC).not.toMatch(/reviews\s*\?\?\s*0\)\s*>=\s*5/);
  });
});
