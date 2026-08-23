import type { DeckWord, Sentence, PassageToken } from './types';
import { isNewCard, todayStr } from './deck';
import { RECOMMENDED_BLANK_DENSITY } from './languageConfig';

/**
 * Which words a passage blanks out, given the passage and the deck.
 *
 * ONE RULE, TWO CALLERS. A generated passage records its targets at generation time; this
 * decides them from the text instead, and both the reading view and the paste panel's
 * coverage readout go through it. That matters more than it looks: the readout's whole job
 * is to tell you what you are about to get, and a second implementation of "same rules" is
 * how it would quietly start lying. The shared new-card ledger has been breached twice by
 * exactly that kind of near-duplicate.
 *
 * WHICH DUE WORDS, AND WHY NOT ALL OF THEM
 * Every due word in the text is a candidate, and they are taken MOST OVERDUE FIRST. That
 * ordering is the whole design: no word is passed over for being short, common, or easy to
 * guess from context — recall difficulty is FSRS's business, and a missed blank is
 * information the scheduler wants. A word is only left out because the passage ran out of
 * room, and being left out costs it nothing: it stays due, it is still in flashcards, and
 * its debt has only grown by the time the next passage is built, so it sorts higher then.
 *
 * The density cap exists because the alternative is not a harder exercise, it is an
 * unreadable one — 75 blanks in 96 words, with no prose left to recover any of them from.
 *
 * The new-card cap is the reading half of "one budget, two doors" (see selectTargets in
 * hooks/useDailyContent.ts). Filling a blank grades the card, so reading introduces cards
 * exactly as flashcards do and takes on the same future review debt.
 */

/** Short passages still get a usable number of blanks. */
export const MIN_BLANKS = 3;

/**
 * THERE IS NO MAXIMUM. Blanks are `tokens × density`, whatever that comes to.
 *
 * A ceiling was tried and removed. It was anchored on the count the recommended density was
 * calibrated against (~11 blanks in 76 words), which sounds principled and is not: density is
 * a SHARE, and a share that stops scaling past a threshold is no longer a share. Settings →
 * Blank density is the only control over how much of a passage is blanked, and its help text
 * promises exactly that — a cap silently overrode anyone who set it high, and did so hardest
 * on the longest passages, which is where an explicit setting deserves most to be believed.
 *
 * A book section is long, but it is a SECTION: `epubChunk` splits chapters into slices and
 * each one gets the density applied on its own, so the learner never faces a whole novel's
 * worth at once. Length is handled by chunking, not by capping.
 *
 * MIN_BLANKS and the most-owed fallback below both still apply. They only ever raise the
 * count on a passage too short or too repetitive to honour the share, and never lower it.
 */

export interface ClozeTargetResult {
  /** The words to blank, keyed as tokens resolve (surface form, base form, or anchor compound). */
  words: Set<string>;
  /** How many blank occurrences those words cover. */
  blanks: number;
  /** Non-punctuation tokens in the passage — the denominator the density applies to. */
  tokens: number;
  /** Blanks the density preference allows in a passage this long. */
  budget: number;
  /** Distinct due words present in the text, chosen or not. */
  candidates: number;
  /** Due words left out because the daily new-card budget was spent. */
  heldBackByBudget: number;
  /** Due words left out because the passage had no room left at this density. */
  heldBackByDensity: number;
}

/**
 * @param sentences   the passage
 * @param deck        the learner's deck for this language
 * @param dueWords    words ready for review NOW (isReadyNow, not isDueToday — a card
 *                    part-way through a learning step is due today but not due yet, and
 *                    blanking it again ten seconds after it was answered is the thing the
 *                    step exists to prevent)
 * @param blankDensity  the learner's Settings → Blank density, as a percentage
 * @param newBudgetLeft how many new cards today's limit still allows
 */
export function selectClozeTargets(
  sentences: Sentence[],
  deck: DeckWord[],
  dueWords: Set<string>,
  blankDensity: number | undefined,
  newBudgetLeft: number,
): ClozeTargetResult {
  // Occurrences per candidate, in reading order.
  const cost = new Map<string, number>();
  let tokens = 0;
  for (const sent of sentences) {
    for (const t of sent.tokens) {
      if (t.type === 'punct') continue;
      tokens++;
      const key = clozeKey(t, dueWords);
      if (dueWords.has(key)) cost.set(key, (cost.get(key) ?? 0) + 1);
    }
  }

  const share = (blankDensity ?? RECOMMENDED_BLANK_DENSITY) / 100;
  const budget = Math.max(MIN_BLANKS, Math.round(tokens * share));
  const empty: ClozeTargetResult = {
    words: new Set(), blanks: 0, tokens, budget,
    candidates: 0, heldBackByBudget: 0, heldBackByDensity: 0,
  };
  if (cost.size === 0) return empty;

  // How long each has been owed. A card with no `dueAt` is new rather than overdue, so it
  // sorts as due today — behind anything genuinely late, ahead of anything scheduled on.
  const today = todayStr();
  const owedSince = new Map<string, string>();
  for (const w of deck) {
    if (!cost.has(w.h)) continue;
    const due = w.dueAt ?? today;
    const seen = owedSince.get(w.h);
    if (!seen || due < seen) owedSince.set(w.h, due);
  }

  // Map iteration is reading order, so words owed since the same day break ties stably.
  const ranked = [...cost.keys()].sort((a, b) =>
    (owedSince.get(a) ?? today).localeCompare(owedSince.get(b) ?? today));

  let newLeft = newBudgetLeft;
  const words = new Set<string>();
  let blanks = 0;
  let heldBackByBudget = 0;
  let heldBackByDensity = 0;
  for (const word of ranked) {
    const n = cost.get(word)!;
    if (blanks + n > budget) { heldBackByDensity++; continue; }
    const card = deck.find(d => d.h === word);
    if (card && isNewCard(card)) {
      if (newLeft <= 0) { heldBackByBudget++; continue; }
      newLeft--;
    }
    words.add(word);
    blanks += n;
  }

  /**
   * A word is blanked in every one of its occurrences or in none of them — blanking `playa`
   * in the third sentence while printing it in the first just hands over the answer. That
   * rule and a tight budget can deadlock: a word occurring more times than the budget never
   * fits, and if it is the only candidate the section comes out with no blanks at all.
   *
   * Zero practice is the worse outcome, so the most-owed word goes in regardless. It is also
   * the cheap kind of over-budget — the same word again, not another unknown.
   */
  if (words.size === 0 && ranked.length > 0) {
    const first = ranked[0];
    const card = deck.find(d => d.h === first);
    if (!card || !isNewCard(card) || newLeft > 0) {
      words.add(first);
      blanks = cost.get(first)!;
      heldBackByDensity = Math.max(0, heldBackByDensity - 1);
    }
  }

  return { words, blanks, tokens, budget, candidates: cost.size, heldBackByBudget, heldBackByDensity };
}

/**
 * The key a token is matched by — its base form when that is the word the deck holds a card
 * for, otherwise its surface. Every consumer of a target set has to agree on this, or an
 * inflected token counts in one place and not the other.
 */
export function clozeKey(t: PassageToken, words: Set<string>): string {
  return t.baseForm && words.has(t.baseForm) ? t.baseForm : t.text;
}
