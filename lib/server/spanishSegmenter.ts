import esdictData from '@dict/esdict.json';
import { CEFR_VOCAB } from '@/lib/data/cefr-vocab';
import { lemmatizeEs } from './spanishLemmatizer';

/**
 * Server-only Spanish segmenter, the analogue of lib/server/kuromojiSegmenter.ts.
 *
 * Spanish is written with spaces, so there is no morphological analyzer to run: splitting
 * on whitespace and punctuation is both sufficient and exact. What it does share with the
 * Japanese path is everything AFTER splitting — resolving each word to its dictionary form
 * (lib/server/spanishLemmatizer.ts) and attaching a meaning server-side, so the client
 * receives the same RawTok wire format for every language.
 *
 * The `reading` slot of every emitted token is ALWAYS '' — Spanish has no pinyin/furigana
 * analogue (see `hasReadings` in lib/languageConfig.ts).
 */

export type RawTok = [string] | [string, string] | [string, string, string] | [string, string, string, string];

interface DictOverride { p: string; m: string; }

const esdict = esdictData as unknown as Record<string, { p: string; m: string }>;

/**
 * Senses that describe a proper noun rather than an ordinary word. A headword whose ONLY
 * senses look like this is a name that happens to collide with an inflected form
 * (`casas` = "a habitational surname", `bonita` = "a female given name"), and should still
 * be lemmatised — see LemmaDict.isCommonWord.
 */
const NAME_SENSE_RE = /\b(surname|given name|patronymic)\b|^an? [a-zé ]*\b(city|town|village|municipality|province|commune|department|region|river|island)\b/i;

/** The dictionary view the lemmatizer works against. */
const dict = {
  has(word: string): boolean {
    return word in esdict || word in CEFR_VOCAB;
  },
  isCommonWord(word: string): boolean {
    const m = esdict[word]?.m ?? CEFR_VOCAB[word]?.meaning;
    if (!m) return false;
    return m.split('; ').some(sense => sense.trim() && !NAME_SENSE_RE.test(sense.trim()));
  },
};

function resolveMeaning(baseForm: string | undefined, surface: string): string {
  const lower = surface.toLowerCase();
  const key = baseForm ?? lower;
  return esdict[key]?.m ?? esdict[lower]?.m
    ?? CEFR_VOCAB[key]?.meaning ?? CEFR_VOCAB[lower]?.meaning ?? '';
}

/**
 * A word character. Spanish letters plus the internal marks that belong INSIDE a word and
 * must not split it: the apostrophe in `d'Artagnan` and the hyphen in `franco-español`.
 */
const WORD_CHAR = /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9]/;
const JOINER = /[-'’]/;

interface Piece { text: string; isPunct: boolean }

/**
 * Split a sentence into word and punctuation pieces. Every punctuation mark becomes its
 * own piece — including the inverted marks `¿` and `¡`, which open Spanish questions and
 * exclamations and would otherwise be glued onto the following word.
 */
function splitPieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  let buf = '';
  const flush = () => { if (buf) { pieces.push({ text: buf, isPunct: false }); buf = ''; } };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (WORD_CHAR.test(ch)) { buf += ch; continue; }
    // A joiner only stays inside the word when it sits between two word characters.
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
 * Re-join consecutive words whose concatenation is a known deck word or proper name —
 * the same greedy merge the Japanese and Chinese paths use. Spanish needs it for
 * multi-word entries (`por favor`, `tener que`, `a menudo`) and for names the model
 * listed in its "names" side-channel (`Ciudad de México`).
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
 * Segment a plain Spanish sentence into the RawTok wire format the client consumes.
 * `overrides` carries the practiced words and the model's proper-name list, and always
 * wins over the bundled dictionary — same contract as `segmentJa`.
 */
export function segmentEs(text: string, overrides: Map<string, DictOverride>): RawTok[] {
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
        : lemmatizeEs(surface, dict) ?? (lower !== surface && dict.has(lower) ? lower : undefined);
    const override = direct ?? (baseForm ? overrides.get(baseForm) : undefined);
    const meaning = override?.m ?? resolveMeaning(baseForm, surface);

    // Reading is always '' for Spanish; the slot exists only to keep one wire format.
    return baseForm ? [surface, '', meaning, baseForm] : [surface, '', meaning];
  });
}
