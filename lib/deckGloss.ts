import type { DeckWord, LanguageCode } from './types';
import { lookupReadingAsync } from './data/lookup';
import { isMetalinguisticGloss, isProperNounGloss } from './glossQuality';
import { REVISED_GLOSSES } from './data/gloss-revisions';

/**
 * Repair deck cards whose stored definition describes the word's SPELLING instead of
 * teaching it, and drop cards that are somebody's name.
 *
 * A card keeps its own copy of `m` from the moment it was added, so fixing the dictionary
 * does nothing for words already in a deck. `no` kept "abbreviation of noroeste; northwest;
 * not; no" everywhere the card is read — the vocabulary list, the flashcard, the level test
 * — long after the dictionary itself said "not; no".
 *
 * NO VERSION MARKER, AND THAT IS THE FIX
 * This used to run once per language per CARD_GLOSS_VERSION, recorded in localStorage. The
 * marker was written at the end of the sync, but the caller can DISCARD the result — the
 * load effect bails out when the language changed underneath it, and React's dev-mode
 * double-mount makes that the normal case, not an edge case. One discarded run and the
 * language was marked done forever, having repaired nothing; bumping the version just armed
 * the same trap again. Three separate bumps went that way and `no` still read "abbreviation
 * of noroeste" on screen.
 *
 * There is nothing a marker knows that the deck doesn't. A gloss reading "abbreviation of
 * noroeste" is self-evidently the broken kind, so the deck is its own to-do list: scan it,
 * and if nothing is broken return in a few microseconds having touched no storage. A card
 * that slips through today is then simply repaired on the next load.
 *
 * The marker's supposed payment — not fetching a multi-megabyte dictionary on every start —
 * turned out to be imaginary: useWordLookup and useDailyContent both call preloadDict on
 * mount, so the file is fetched once per load whatever this function does. It was buying
 * nothing and costing the repair.
 */

/**
 * Passed as the lookup's fallback so a miss is DISTINGUISHABLE from a hit.
 *
 * lookupReadingAsync echoes the fallback back when it finds nothing — and it also finds
 * nothing when the dictionary failed to load, since that failure is swallowed on purpose so
 * the rest of the app keeps working offline. Handing it the card's own gloss made those two
 * cases identical, so a run where the dictionary never arrived looked like "checked
 * everything, nothing to change". A sentinel tells them apart, and an unrepaired card is
 * simply still broken next load, which is exactly when we try again.
 */
const MISS = '\u0000no-dictionary-entry';

/**
 * Does this card carry a sense that describes its own spelling? — "abbreviation of
 * noroeste", "The first letter of the Spanish alphabet", "alternative spelling of éste".
 *
 * That is a sufficient signal on its own, because nobody writes a definition like that: it
 * is the fingerprint of a gloss we shipped.
 *
 * The Vocab tab's Edit button is gone, so no card gloss is user-authored any more and this
 * test no longer has anything to protect. Kept narrow regardless: a card can still carry a
 * gloss from an older build or a restored backup, and replacing only the recognisably
 * broken ones is still the right default.
 *
 * Note this is also the retry condition. A word whose every sense is metalinguistic — a
 * genuine letter name — keeps its gloss (reorder-glosses.mjs never empties an entry), so it
 * stays "stale" and costs one dictionary load per session. Rare enough to accept.
 */
function isSpellingGloss(w: DeckWord): boolean {
  return !!w.m && w.m.split(';').some(sense => isMetalinguisticGloss(sense.trim()));
}

/**
 * The other kind of staleness: a gloss that reads perfectly well and is simply the wrong
 * definition.
 *
 * `primera` shipped as "first gear (lowest gear in a motor vehicle); first class" — the
 * ordinal sense lives in a form_of sense the build routes into the FORMS map, so only the
 * niche noun readings survived. Nothing about that string looks broken, so isSpellingGloss
 * cannot see it, and the card stayed wrong indefinitely while the dictionary behind it was
 * fixed.
 *
 * What makes it safe to overwrite is not a test on the text but a RECORD: scripts/
 * reorder-glosses.mjs emits lib/data/gloss-revisions.ts naming every headword whose bundled
 * definition it replaced. Those are ours, we changed them, and a card still holding the old
 * value is holding something we no longer ship. Everything outside that list is left alone,
 * so a definition the learner rewrote is untouched unless it happens to be one of these few
 * dozen words — a trade worth making only because the list is small and named.
 */
function hasRevisedGloss(lang: LanguageCode, w: DeckWord): boolean {
  return (REVISED_GLOSSES[lang] ?? []).includes(w.h);
}

/**
 * Returns a new deck when anything changed, or the ORIGINAL array reference when nothing
 * did — so callers can skip the write. Never throws: a failed dictionary load leaves the
 * deck alone, and the next load tries again.
 */
export async function syncDeckGlosses(lang: LanguageCode, deck: DeckWord[]): Promise<DeckWord[]> {
  if (deck.length === 0) return deck;

  // Proper nouns first, and they are REMOVED rather than re-glossed: a character's name from
  // a passage is not vocabulary, will not recur, and cannot be studied. Keyed on the
  // generator's own "(name) …" marker, so this can only catch cards it produced.
  const named = deck.filter(w => w.m && isProperNounGloss(w.m));
  if (named.length > 0) {
    deck = deck.filter(w => !(w.m && isProperNounGloss(w.m)));
    console.info(`[gloss] removed ${named.length} proper-noun card(s) from the ${lang} deck: ${named.map(w => w.h).join(', ')}`);
  }

  // The whole point of scanning first: a healthy deck costs one regex pass over its glosses
  // and never touches the dictionary, which is what the version marker used to buy.
  const stale = deck.filter(w => isSpellingGloss(w) || hasRevisedGloss(lang, w));
  if (stale.length === 0) return deck;

  const fixes = new Map<DeckWord, string>();
  await Promise.all(stale.map(async w => {
    try {
      const fresh = (await lookupReadingAsync(lang, w.h, w.p ?? '', MISS))?.meaning;
      if (!fresh || fresh === MISS || fresh === w.m) return;   // no entry, or it never loaded
      fixes.set(w, fresh);
    } catch { /* leave the card alone; it is still stale next load */ }
  }));

  if (fixes.size === 0) return deck;
  console.info(`[gloss] repaired ${fixes.size} ${lang} card definition(s) from the dictionary`);
  return deck.map(w => {
    const fresh = fixes.get(w);
    return fresh ? { ...w, m: fresh } : w;
  });
}
