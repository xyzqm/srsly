import type { DeckWord, LanguageCode } from './types';
import { lookupReadingAsync } from './data/lookup';

/**
 * Re-sync deck glosses with the dictionary, for words whose definition we shipped.
 *
 * A card stores its own copy of `m` at the moment it was added, so improving the dictionary
 * does nothing for words already in a deck. `no` kept "abbreviation of noroeste; northwest;
 * not; no" in every surface that reads the card — the vocabulary list, the Orbit tooltip,
 * flashcards — long after the dictionary itself was fixed.
 *
 * ONLY A PERMUTATION IS REPLACED, and that restriction is the whole safety argument. The
 * Vocab tab lets you rewrite a definition in your own words, and silently overwriting that
 * would be far worse than the bug being fixed. So a card is only re-synced when its senses
 * are the same SET as the dictionary's, just in a different order — which can only be true
 * of a gloss that came from the dictionary and has since been re-ranked. Anything you typed
 * differs by more than order and is left exactly as it is.
 *
 * Runs once per language per CARD_GLOSS_VERSION; the marker is device-local for the same
 * reason the curriculum prune's is (it records what has been done to this copy of the deck).
 */

/** Bump when the dictionaries are re-ranked in a way decks should pick up. */
export const CARD_GLOSS_VERSION = 1;

const MARKER_KEY = 'srsly-gloss-synced';

function readMarkers(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(MARKER_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

export function needsGlossSync(lang: LanguageCode): boolean {
  return (readMarkers()[lang] ?? 0) < CARD_GLOSS_VERSION;
}

function writeMarker(lang: LanguageCode): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MARKER_KEY, JSON.stringify({ ...readMarkers(), [lang]: CARD_GLOSS_VERSION }));
  } catch { /* private mode / quota — the sync simply runs again next load */ }
}

/** Senses as a comparable set: order-insensitive, whitespace- and case-insensitive. */
function senseKey(meaning: string): string {
  return meaning
    .split(';')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('');
}

/**
 * Returns a new deck when anything changed, or the original array when nothing did — so
 * callers can skip the write. Never throws: a failed dictionary load leaves the deck alone
 * and the marker unset, so it retries next time.
 */
export async function syncDeckGlosses(lang: LanguageCode, deck: DeckWord[]): Promise<DeckWord[]> {
  if (!needsGlossSync(lang) || deck.length === 0) return deck;

  let changed = 0;
  const next = await Promise.all(deck.map(async w => {
    if (!w.m) return w;
    try {
      const entry = await lookupReadingAsync(lang, w.h, w.p ?? '', w.m);
      const fresh = entry?.meaning;
      // Same senses, different order → ours is the stale ranking. Different senses → the
      // learner's own wording, or a word the dictionary no longer has. Leave both alone.
      if (!fresh || fresh === w.m || senseKey(fresh) !== senseKey(w.m)) return w;
      changed++;
      return { ...w, m: fresh };
    } catch {
      return w;
    }
  }));

  writeMarker(lang);
  if (changed === 0) return deck;
  console.info(`[gloss] re-ranked ${changed} ${lang} card definition(s) to match the dictionary`);
  return next;
}
