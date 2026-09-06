import type { Sentence, PassageToken } from './types';
import { needsSpaceBefore } from './tokenText';

/**
 * The pure half of listening dictation.
 *
 * ── WHAT DICTATION IS HERE ──
 * NOT a new mode. It is the generated passage's EXISTING cloze blanks, with the text
 * withheld and the audio supplied. Same typed input, same grading, same FSRS write, no new
 * stored state — see `ClozeBlank` in components/read/PassageText.tsx, which does all of it
 * already. What changes is only what the learner can SEE while answering.
 *
 * ── THE AUDIO IS COMPLETE; THE TEXT IS WHAT HAS GAPS ──
 * The obvious build is `speakWithBlank()` — speak up to the blank, go silent, speak the
 * rest — and it is the wrong way round for this exercise. The learner is asked to type what
 * they HEARD, and a word that was never spoken cannot be heard. Silence at the gap tests
 * whether you can infer a missing word from context; playing the whole sentence tests
 * whether you can recognise it by ear and spell it, which is the thing listening practice
 * is for. So the sentence is spoken in full and the page is what hides it.
 *
 * `speakWithBlank` keeps a job — the "play it with the gap" hint, for a learner who has
 * heard the sentence and still cannot place the word — which is what `splitAtBlank` below
 * is for. It also handles exactly ONE gap, and a sentence can carry several (a word is
 * blanked in all of its occurrences, and blanks have no ceiling), so it could not have been
 * the spine even for the other design.
 */

/** One sentence worth dictating, and where its blanks are. */
export interface DictationSentence {
  /** Index into the passage's `sentences`. */
  index: number;
  /** Token indices within that sentence that render as blanks, ascending. */
  blankTokenIdxs: number[];
}

/**
 * The sentences a dictation run should step through.
 *
 * Only sentences carrying at least one blank: a sentence with nothing to fill in asks the
 * learner nothing, and playing it would make the run mostly listening to prose with no
 * question attached. The passage still contains those sentences — they are read on the way
 * past, and revealed with the rest — they simply are not stops.
 *
 * `isBlank` is a predicate rather than a word set because deciding what renders as a blank
 * is genuinely more involved than membership: a Japanese token matches on its base form, and
 * an occurrence that has already been graded stays a blank even after the grade pushed the
 * word out of the due set. That rule lives in the renderer; duplicating it here is how the
 * two would come to disagree about which words are blanks.
 */
export function dictationSentences(
  sentences: Sentence[],
  isBlank: (sentenceIdx: number, tokenIdx: number, token: PassageToken) => boolean,
): DictationSentence[] {
  const out: DictationSentence[] = [];
  sentences.forEach((sent, index) => {
    const blankTokenIdxs: number[] = [];
    sent.tokens.forEach((token, ti) => {
      if (isBlank(index, ti, token)) blankTokenIdxs.push(ti);
    });
    if (blankTokenIdxs.length > 0) out.push({ index, blankTokenIdxs });
  });
  return out;
}

/**
 * The two halves of a sentence either side of one blank, as speakable plaintext.
 *
 * Built by walking the WHOLE token array and asking `needsSpaceBefore` at each position,
 * rather than slicing the array and flattening each piece. Slicing changes every token's
 * index, and the spacing rules read neighbours — so `¿` would stop hugging the word after
 * it and a French `-tu` would float away from its verb, which is exactly the disagreement
 * between the spoken text and the rendered text that `lib/tokenText.ts` exists to prevent.
 */
export function splitAtBlank(
  tokens: PassageToken[],
  blankIdx: number,
  scriptIsUnspaced: boolean,
): { before: string; after: string } {
  let before = '';
  let after = '';
  for (let i = 0; i < tokens.length; i++) {
    if (i === blankIdx) continue;
    const piece = needsSpaceBefore(tokens, i, scriptIsUnspaced) + tokens[i].text;
    if (i < blankIdx) before += piece;
    else after += piece;
  }
  return { before: before.trim(), after: after.trim() };
}

/**
 * Has every blank in this sentence been answered?
 *
 * Which is what reveals the text — the decision being that seeing the sentence you just
 * heard is where the learning lands, so it is shown the moment it is earned rather than
 * held to the end of the run.
 */
export function sentenceRevealed(blankTokenIdxs: number[], answered: (tokenIdx: number) => boolean): boolean {
  return blankTokenIdxs.every(answered);
}
