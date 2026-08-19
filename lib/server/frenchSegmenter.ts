import frdictData from '@dict/frdict.json';
import { FR_VOCAB } from '@/lib/data/fr-vocab';
import { lemmatizeFr, normalizeApostrophe, type LemmaDict } from './frenchLemmatizer';

/**
 * Server-only French segmenter, the analogue of lib/server/spanishSegmenter.ts.
 *
 * French is space-delimited, so splitting is exact and needs no analyzer. The work is in
 * resolving each token to its dictionary form (lib/server/frenchLemmatizer.ts) and
 * attaching a meaning server-side, so the client receives the same RawTok wire format for
 * every language.
 *
 * The `reading` slot of every emitted token is ALWAYS '' — French is written in the same
 * alphabet it is read in (see `hasReadings` in lib/languageConfig.ts).
 */

export type RawTok = [string] | [string, string] | [string, string, string] | [string, string, string, string];

interface DictOverride { p: string; m: string; }

const frdict = frdictData as unknown as Record<string, { p: string; m: string }>;

/** Senses that describe a proper noun rather than an ordinary word — a headword whose only
 *  senses look like this shouldn't block lemmatization. */
const NAME_SENSE_RE = /\b(surname|given name|patronymic)\b|^an? [a-zé ]*\b(city|town|village|commune|department|province|region|river|island)\b/i;

const dict: LemmaDict = {
  has(word: string): boolean {
    return word in frdict || word in FR_VOCAB;
  },
  isCommonWord(word: string): boolean {
    const m = frdict[word]?.m ?? FR_VOCAB[word]?.meaning;
    if (!m) return false;
    return m.split('; ').some(sense => sense.trim() && !NAME_SENSE_RE.test(sense.trim()));
  },
};

function resolveMeaning(baseForm: string | undefined, surface: string): string {
  // Apostrophe folded for the same reason the lemmatizer folds it: the dictionary keys
  // `chef-d'œuvre` with U+0027 and pasted prose writes U+2019.
  const lower = normalizeApostrophe(surface.toLowerCase());
  const key = baseForm ?? lower;
  return frdict[key]?.m ?? frdict[lower]?.m
    ?? FR_VOCAB[key]?.meaning ?? FR_VOCAB[lower]?.meaning ?? '';
}

/** French letters, plus digits for numerals. */
const WORD_CHAR = /[a-zA-ZàâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ0-9]/;
/** Marks that belong INSIDE a word: the elision apostrophe (l'eau, aujourd'hui) and the
 *  hyphen of peut-être. Elision is peeled off later by the lemmatizer, not here — keeping
 *  `l'eau` whole means the passage still reads naturally while the card links to `eau`. */
const JOINER = /[-'’]/;

interface Piece { text: string; isPunct: boolean }

/**
 * Split a sentence into word and punctuation pieces. French uses « » guillemets alongside
 * the usual marks, and writes a space before ; : ! ? — the space is dropped here and put
 * back at render time by the shared spacing rules.
 */
function splitPieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  let buf = '';
  const flush = () => { if (buf) { pieces.push({ text: buf, isPunct: false }); buf = ''; } };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (WORD_CHAR.test(ch)) { buf += ch; continue; }
    if (JOINER.test(ch) && buf && WORD_CHAR.test(text[i + 1] ?? '')) { buf += ch; continue; }
    flush();
    if (/\s/.test(ch)) continue;      // whitespace separates, but is never a token
    pieces.push({ text: ch, isPunct: true });
  }
  flush();
  return pieces;
}

/** Longest run of consecutive words a greedy merge will reconstruct as one entry. */
const MAX_MERGE = 4;

/**
 * Re-join consecutive words whose concatenation is a known deck word or proper name — the
 * same greedy merge the other languages use. French needs it for multi-word entries
 * (tout à coup, à peu près) and for names the model listed in its "names" side-channel.
 */
function mergeKnownRuns(pieces: Piece[], overrides: Map<string, DictOverride>): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i].isPunct) { out.push(pieces[i]); continue; }
    let merged: Piece | null = null;
    let used = 1;
    for (let len = Math.min(MAX_MERGE, pieces.length - i); len >= 2; len--) {
      const window = pieces.slice(i, i + len);
      if (window.some(p => p.isPunct)) continue;
      const joined = window.map(p => p.text).join(' ');
      if (overrides.has(joined) || overrides.has(joined.toLowerCase())) {
        merged = { text: joined, isPunct: false };
        used = len;
        break;
      }
    }
    out.push(merged ?? pieces[i]);
    i += used - 1;
  }
  return out;
}

/**
 * Segment a plain French sentence into the RawTok wire format the client consumes.
 * `overrides` carries the practiced words and the model's proper-name list, and always
 * wins over the bundled dictionary — same contract as the other segmenters.
 */
export function segmentFr(text: string, overrides: Map<string, DictOverride>): RawTok[] {
  if (!text) return [];

  return mergeKnownRuns(splitPieces(text), overrides).map((piece): RawTok => {
    if (piece.isPunct) return [piece.text];

    const surface = piece.text;
    const lower = surface.toLowerCase();
    // An override keyed by the EXACT surface is authoritative — that is the deck's own card,
    // spelled the way it appears here.
    const directExact = overrides.get(surface);
    // Matched only once lowercased: the card is `hola`, the passage opens with `Hola`.
    const directLower = directExact ? undefined : overrides.get(lower);
    const direct = directExact ?? directLower;

    /**
     * Capitalisation counts as an inflection: deck cards and dictionary headwords are
     * lowercase, but a word can open a sentence or a title, and every downstream matcher
     * keys on `baseForm ?? text`. So a case-only difference has to leave the lowercase form
     * behind as the base form, or nothing can link the token back to the card.
     *
     * This used to read `direct ? undefined : …`, which threw that link away for precisely
     * the words that had one. A greetings deck — `hola`, `gracias`, `buenos dias`, `adios`
     * — is nearly all sentence-openers, so ten due words produced one blank: `por favor`,
     * the only one the passage happened to use mid-sentence in lowercase.
     */
    const baseForm = directExact
      ? undefined
      : directLower
        ? lower
        : lemmatizeFr(surface, dict) ?? (lower !== surface && dict.has(lower) ? lower : undefined);
    const override = direct ?? (baseForm ? overrides.get(baseForm) : undefined);
    const meaning = override?.m ?? resolveMeaning(baseForm, surface);

    // Reading is always '' for French; the slot exists only to keep one wire format.
    return baseForm ? [surface, '', meaning, baseForm] : [surface, '', meaning];
  });
}
