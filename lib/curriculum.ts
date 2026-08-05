import type { DeckWord, LanguageCode } from './types';

/**
 * Pruning decks against the graded vocabulary tables.
 *
 * The es/fr level tables used to be banded from OpenSubtitles frequency, which is one
 * register of film dialogue. That put a lot of slang, profanity and spoken-only debris
 * into the study lists, and from there into people's decks — words the passage generator
 * then had to build sentences around, which it does badly because they are not prose
 * words. Spanish now bands across three registers (scripts/lib/corpusFreq.mjs) and French
 * off Lexique 3 (scripts/lib/lexique.mjs), so the words that came from the old source
 * need to leave the decks they landed in.
 *
 * This is a HARD DELETE. There is no archive state and no undo: the app has no live users
 * yet, so preserving the review history of words we no longer consider vocabulary buys
 * nothing. If that changes, the honest version of this is `paused: true` plus a reason
 * flag, not a filter.
 *
 * Only es and fr are pruned. Chinese and Japanese band from the published HSK and JLPT
 * exam lists, which never had a subtitle corpus behind them and are not being rebuilt.
 */

/** Bump when the graded tables are regenerated in a way that should re-prune decks. */
export const CURRICULUM_VERSION = 2;

/** Languages whose tables came from the subtitle corpus and are therefore pruned. */
const PRUNED_LANGUAGES: readonly LanguageCode[] = ['es', 'fr'];

/** Per-device marker of the last version each language was pruned at.
 *  Deliberately NOT in `storage`/prefs: this records what has been done to the copy of the
 *  deck on this device, not a user preference worth syncing to another one. */
const MARKER_KEY = 'srsly-curriculum-pruned';

function readMarkers(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MARKER_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

function writeMarker(lang: LanguageCode): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MARKER_KEY, JSON.stringify({ ...readMarkers(), [lang]: CURRICULUM_VERSION }));
  } catch { /* private mode / quota — the prune simply runs again next load */ }
}

/** True when this language still needs pruning at the current curriculum version. */
export function needsPrune(lang: LanguageCode): boolean {
  if (!PRUNED_LANGUAGES.includes(lang)) return false;
  return (readMarkers()[lang] ?? 0) < CURRICULUM_VERSION;
}

/**
 * The set of headwords the language's graded tables now contain.
 *
 * Dynamically imported for the same reason every other consumer does it: these tables are
 * 600–900 kB of source each, and statically importing them would put every language's
 * vocabulary in the initial bundle for every user. Returns null if the chunk fails to
 * load, which callers must treat as "cannot decide" — never as "everything is off-curriculum".
 */
export async function loadCurriculumWords(lang: LanguageCode): Promise<Set<string> | null> {
  try {
    switch (lang) {
      case 'es': return new Set(Object.keys((await import('./data/cefr-vocab')).CEFR_VOCAB));
      case 'fr': return new Set(Object.keys((await import('./data/fr-vocab')).FR_VOCAB));
      default: return null;
    }
  } catch {
    return null;
  }
}

/**
 * Drop every deck word that is no longer in the language's graded vocabulary.
 *
 * Matching is on the headword, lowercased for the two Latin-script languages (deck entries
 * can be capitalised from a sentence-initial capture; the tables are all lowercase) and on
 * `baseForm` where a card was added from an inflected surface.
 *
 * Returns the original array reference when nothing is removed, so callers can skip the
 * write, and when the table could not be loaded — a failed dynamic import must never be
 * read as "delete the whole deck".
 */
export async function pruneDeckToCurriculum(lang: LanguageCode, deck: DeckWord[]): Promise<DeckWord[]> {
  if (!needsPrune(lang) || deck.length === 0) return deck;

  const words = await loadCurriculumWords(lang);
  if (!words) return deck;

  const key = (s: string) => s.trim().toLowerCase();
  const kept = deck.filter(w => words.has(key(w.h)));

  // Only mark done once the table actually loaded and the filter ran, so a transient
  // import failure leaves the prune pending rather than silently skipping it forever.
  writeMarker(lang);

  if (kept.length === deck.length) return deck;
  console.info(`[curriculum] pruned ${deck.length - kept.length} off-curriculum ${lang} word(s) from the deck`);
  return kept;
}
