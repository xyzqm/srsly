import type { LanguageCode } from '@/lib/types';
import { segmentJa } from './kuromojiSegmenter';
import { segmentEs } from './spanishSegmenter';
import { segmentFr } from './frenchSegmenter';

/**
 * Resolves a single typed word to its dictionary entry, server-side.
 *
 * This is the one place that knows how to turn an inflected surface into a card: 食べました
 * → 食べる, organizamos → organizar, 먹었어요 → 먹다, mangé → manger. Both `/api/{lang}-word-lookup` (one word,
 * used by AddWordForm) and `/api/batch-word-lookup` (many words, used by ImportPanel) go
 * through it, so the two entry points cannot drift apart and start disagreeing about
 * whether a given word is real.
 *
 * Chinese is deliberately absent: it has no inflection to undo, and its dictionary
 * (CC-CEDICT) plus its polyphone table already live on the client, where the import panel
 * resolves it directly. Routing it through here would mean shipping another 8 MB
 * dictionary into the server bundle to compute an answer the browser already has.
 */
export interface ResolvedWord {
  /** True only when a single dictionary entry with a real gloss was found. */
  found: boolean;
  /** The surface as submitted, trimmed. */
  surface: string;
  /** Dictionary form to file the card under — the lemma when the surface was inflected. */
  word: string;
  /** Reading, where the language has one; '' for es/ko. */
  reading: string;
  /** The dictionary's own gloss. Never anything the user supplied. */
  meaning: string;
}

/** No practiced-word or proper-name overrides apply when resolving a bare typed word. */
const NO_OVERRIDES = new Map<string, { p: string; m: string }>();

export async function resolveWordServer(language: LanguageCode, raw: string): Promise<ResolvedWord> {
  const surface = typeof raw === 'string' ? raw.trim() : '';
  const miss: ResolvedWord = { found: false, surface, word: '', reading: '', meaning: '' };
  if (!surface) return miss;

  let tokens;
  if (language === 'ja') tokens = await segmentJa(surface, NO_OVERRIDES);
  else if (language === 'es') tokens = segmentEs(surface, NO_OVERRIDES);
  else if (language === 'fr') tokens = segmentFr(surface, NO_OVERRIDES);
  else return miss;   // zh — resolved client-side, see the note above

  // More than one token means a phrase, not a word: there is no single entry to file it
  // under, so it counts as not found rather than being silently truncated.
  if (tokens.length !== 1) return miss;

  const [text, reading = '', meaning = '', baseForm] = tokens[0];
  if (!meaning) return miss;
  return { found: true, surface, word: baseForm ?? text, reading, meaning };
}
