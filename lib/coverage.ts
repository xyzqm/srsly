import type { Sentence } from './types';
import { clozeKey } from './clozeTargets';

/**
 * How much of a text the learner's deck actually covers.
 *
 * This exists for one situation, which is the normal one: a real article dropped against a
 * beginner deck. Three words are due, so three blanks appear, and every one of them is
 * correct — while four hundred other words are ones the app has never seen the learner
 * study. The cloze exercise is fine and the reading is impossible, and nothing in the UI
 * would say so. This is what says so, before anything is committed.
 *
 * WHAT "NOT IN YOUR DECK" MEANS, AND WHAT IT DOESN'T
 * It is not "unknown". A learner knows thousands of words they have never made a card for,
 * starting with most of the function words in any sentence. The deck is the only evidence
 * this app has, so that is what the numbers are named after — the copy that renders them
 * must not upgrade it to a claim about the reader.
 */

export interface TextCoverage {
  /** Running words — punctuation excluded. */
  tokens: number;
  /** Distinct word types, counted by base form where there is one. */
  types: number;
  inDeckTokens: number;
  inDeckTypes: number;
  /** Due now, so a blank candidate. */
  dueTokens: number;
  dueTypes: number;
  notInDeckTokens: number;
  notInDeckTypes: number;
  /** A few of each, so the readout can show what it is talking about rather than a number. */
  dueSample: string[];
  notInDeckSample: string[];
}

const SAMPLE = 12;

export function analyzeCoverage(
  sentences: Sentence[],
  deckWords: Set<string>,
  dueWords: Set<string>,
): TextCoverage {
  const seen = new Map<string, { inDeck: boolean; due: boolean; count: number }>();
  let tokens = 0;

  for (const sent of sentences) {
    for (const t of sent.tokens) {
      if (t.type === 'punct') continue;
      tokens++;
      // Identity is the base form when there is one, so `allés` and `allé` are one word
      // rather than two — otherwise a heavily inflected text looks more varied than it is.
      const id = t.baseForm ?? t.text;
      const inDeck = deckWords.has(t.text) || (!!t.baseForm && deckWords.has(t.baseForm));
      const due = dueWords.has(clozeKey(t, dueWords));
      const cur = seen.get(id);
      if (cur) {
        cur.count++;
        cur.inDeck ||= inDeck;
        cur.due ||= due;
      } else {
        seen.set(id, { inDeck, due, count: 1 });
      }
    }
  }

  const out: TextCoverage = {
    tokens, types: seen.size,
    inDeckTokens: 0, inDeckTypes: 0,
    dueTokens: 0, dueTypes: 0,
    notInDeckTokens: 0, notInDeckTypes: 0,
    dueSample: [], notInDeckSample: [],
  };

  for (const [word, s] of seen) {
    if (s.due) {
      out.dueTypes++;
      out.dueTokens += s.count;
      if (out.dueSample.length < SAMPLE) out.dueSample.push(word);
    }
    if (s.inDeck) {
      out.inDeckTypes++;
      out.inDeckTokens += s.count;
    } else {
      out.notInDeckTypes++;
      out.notInDeckTokens += s.count;
      if (out.notInDeckSample.length < SAMPLE) out.notInDeckSample.push(word);
    }
  }

  return out;
}

export type CoverageVerdict = 'comfortable' | 'workable' | 'heavy' | 'beyond';

/**
 * How hard this text will be to read, from the share of RUNNING words outside the deck —
 * running words, not distinct ones, because a rare word met once costs a fraction of what a
 * word you trip over on every line does.
 *
 * The bands are deliberately coarse. There is a well-known research figure for the coverage
 * a reader needs (around 95–98% of running text) but it is about words the reader KNOWS, and
 * deck membership is a much weaker signal than that — so these are rules of thumb for
 * sizing a decision, not a measurement dressed up as one.
 */
export function verdictFor(c: TextCoverage): CoverageVerdict {
  if (c.tokens === 0) return 'comfortable';
  const outside = c.notInDeckTokens / c.tokens;
  if (outside < 0.15) return 'comfortable';
  if (outside < 0.35) return 'workable';
  if (outside < 0.6) return 'heavy';
  return 'beyond';
}
