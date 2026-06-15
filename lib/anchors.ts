import type { DeckWord } from './types';

/**
 * Compound-anchored polyphones.
 *
 * A reading that doesn't stand alone (e.g. 行 háng) is stored on its card as a
 * list of `compounds` (银行, 行业, …). Generated passages use one of those whole
 * words instead of the bare character. An "anchor" maps that compound's surface
 * form back to the underlying deck card, so:
 *   - the whole compound is highlighted as a review word, and
 *   - reviewing it (peek / quiz) grades the underlying reading card by id.
 */
export interface Anchor {
  /** id of the underlying DeckWord (the reading card, e.g. 行 háng). */
  id: string;
  /** the underlying character (行). */
  hanzi: string;
  /** the reading's pinyin (háng). */
  pinyin: string;
  /** the compound surface form actually shown (银行). */
  compound: string;
}

/**
 * Build a lookup from every compound surface form → its underlying card.
 * If two cards claim the same compound, the first in deck order wins (deck is
 * newest-first, so the most recently added card takes precedence).
 */
export function buildAnchorMap(deck: DeckWord[]): Map<string, Anchor> {
  const map = new Map<string, Anchor>();
  for (const w of deck) {
    if (!w.id || !w.compounds) continue;
    for (const compound of w.compounds) {
      const c = compound.trim();
      if (!c || map.has(c)) continue;
      map.set(c, { id: w.id, hanzi: w.h, pinyin: w.p, compound: c });
    }
  }
  return map;
}
