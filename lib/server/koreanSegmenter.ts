import kodictData from '@/public/kodict.json';
import { TOPIK_VOCAB } from '@/lib/data/topik-vocab';
import { lemmatizeKo, type LemmaDict } from './koreanLemmatizer';

/**
 * Server-only Korean segmenter, the analogue of kuromojiSegmenter (ja) and
 * spanishSegmenter (es).
 *
 * Korean is space-delimited, so splitting the sentence is exact and needs no analyzer —
 * the same as Spanish. What is different is what sits inside each space-delimited chunk:
 * an eojeol fuses a content word with its particles and verb endings, so resolving
 * `학교에서` → `학교` and `먹었어요` → `먹다` is where the work is. That lives in
 * lib/server/koreanLemmatizer.ts.
 *
 * The `reading` slot of every emitted token is ALWAYS '' — Hangul is phonetic, so there is
 * no pinyin/furigana analogue (see `hasReadings` in lib/languageConfig.ts).
 */

export type RawTok = [string] | [string, string] | [string, string, string] | [string, string, string, string];

interface DictOverride { p: string; m: string; }

const kodict = kodictData as unknown as Record<string, { p: string; m: string }>;

/**
 * Senses that describe a proper noun rather than an ordinary word. Mirrors the Spanish
 * segmenter: a headword whose only senses look like this shouldn't block lemmatization.
 */
const NAME_SENSE_RE = /\b(surname|given name|patronymic)\b|^an? [a-z ]*\b(city|town|village|county|province|district|river|island|dynasty)\b/i;

const dict: LemmaDict = {
  has(word: string): boolean {
    return word in kodict || word in TOPIK_VOCAB;
  },
  isCommonWord(word: string): boolean {
    const m = kodict[word]?.m ?? TOPIK_VOCAB[word]?.meaning;
    if (!m) return false;
    return m.split('; ').some(sense => sense.trim() && !NAME_SENSE_RE.test(sense.trim()));
  },
};

function resolveMeaning(baseForm: string | undefined, surface: string): string {
  const key = baseForm ?? surface;
  return kodict[key]?.m ?? kodict[surface]?.m
    ?? TOPIK_VOCAB[key]?.meaning ?? TOPIK_VOCAB[surface]?.meaning ?? '';
}

/** Hangul syllables plus the jamo blocks, and Latin/digits for loanwords and numerals. */
const WORD_CHAR = /[가-힣ᄀ-ᇿ㄰-㆏a-zA-Z0-9]/;
const JOINER = /[-'’]/;

interface Piece { text: string; isPunct: boolean }

/**
 * Split a sentence into word and punctuation pieces. Modern Korean uses Latin punctuation
 * (. , ? !) alongside the CJK forms (。 、 「 」), so both are treated as punctuation.
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
 * same greedy merge the other languages use. Korean needs it for multi-word entries and
 * for names the model listed in its "names" side-channel (예: 서울 대학교).
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
      if (overrides.has(joined)) {
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
 * Segment a plain Korean sentence into the RawTok wire format the client consumes.
 * `overrides` carries the practiced words and the model's proper-name list, and always
 * wins over the bundled dictionary — same contract as `segmentJa` / `segmentEs`.
 */
export function segmentKo(text: string, overrides: Map<string, DictOverride>): RawTok[] {
  if (!text) return [];

  return mergeKnownRuns(splitPieces(text), overrides).map((piece): RawTok => {
    if (piece.isPunct) return [piece.text];

    const surface = piece.text;
    // An override keyed by the surface is authoritative — that is the deck's own card.
    const direct = overrides.get(surface);
    const baseForm = direct ? undefined : lemmatizeKo(surface, dict);
    // A deck card is usually stored in dictionary form (먹다), so an inflected surface only
    // matches its override once the lemma is known.
    const override = direct ?? (baseForm ? overrides.get(baseForm) : undefined);
    const meaning = override?.m ?? resolveMeaning(baseForm, surface);

    // Reading is always '' for Korean; the slot exists only to keep one wire format.
    return baseForm ? [surface, '', meaning, baseForm] : [surface, '', meaning];
  });
}

/** Exposed so the build script can reuse the exact runtime dictionary view. */
export { dict as koreanDict };
