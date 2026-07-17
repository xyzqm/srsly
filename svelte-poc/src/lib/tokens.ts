import type { PassageToken } from './types';

// The server (src/lib/server/generate.ts) resolves every word's reading + meaning via
// getDefinition (the centralized Supabase word_definitions table) before storing a passage, so
// turning raw tokens into PassageTokens here is a straight mapping — no client-side dictionary,
// no segmentation-repair heuristics needed.

export interface RawTok {
  text: string;
  reading?: string;
  meaning?: string;
}

// Compact, raw (un-normalized) content as generated on the server and stored in Supabase. `body`
// is the whole passage as one flat token stream — sentence boundaries aren't tracked, since cloze
// occurrences only need a stable position in the passage, not a (sentence, token) pair.
export interface RawPassage { title: RawTok[]; body: RawTok[] }

/** Per-blank cloze fill state, keyed by the token's index in `passage.body`. Unfilled = key
 *  absent; the word itself isn't stored here since it's derivable from `passage`. */
export type BlankProgress = Record<string, 0 | 1>;

/** One row from the `passages` table (see supabase-passages.sql). `quizWords` is frozen at
 *  generation time (whichever words the passage was built around) rather than re-derived from
 *  live deck due-status — a word graded mid-session can leave the due set within minutes under
 *  short-term scheduling, and blanks shouldn't disappear out from under an in-progress passage. */
export interface StoredPassage {
  id: string;
  date: string;
  passage: RawPassage;
  quizWords: string[];
  progress: BlankProgress;
  addedWords: string[];
}

const PUNCT_CHARS = new Set([
  '。', '！', '？', '，', '、', '—', '…', '·', '「', '」', '『', '』',
  '“', '”', '‘', '’', '（', '）', '【', '】', '《', '》', '〈', '〉',
  '：', '；', ',', '.', ';', ':', '!', '?', '(', ')', '"', "'", '[', ']', '{', '}',
  '～', '~', '／', '\\', '|', '`', '^',
]);

/** Whether a single character is punctuation rather than a word character. Also used by
 *  the BudouX-based segmenters (see segment.ts) to peel punctuation off phrase boundaries — so
 *  this must recognize hiragana/katakana as word characters too, not just Han ideographs, or
 *  Japanese phrases get shredded kana-by-kana. */
export function isPunctChar(ch: string): boolean {
  return PUNCT_CHARS.has(ch) || (!/[一-鿿㐀-䶿぀-ヿ]/.test(ch) && !/[a-zA-Z0-9]/.test(ch));
}

function isPunct(text: string): boolean {
  return text.length === 1 && isPunctChar(text);
}

function rawToToken({ text, reading, meaning }: RawTok): PassageToken {
  if (isPunct(text)) return { text, type: 'punct' };
  if (meaning) return { text, reading: reading || undefined, meaning, type: 'vocab' };
  if (reading) return { text, reading };
  return { text };
}

// Drop empty tokens, the literal string "punctuation", and blank/underscore placeholders the
// model sometimes leaves inside fill before/after text (e.g. "____" or "＿＿") instead of only
// removing the answer word.
function keepTok(r: RawTok): boolean {
  const t = r.text;
  return t !== '' && t !== 'punctuation' && !/^[_＿＿‗﹍-﹏\s]+$/.test(t);
}

export function buildTokens(row: RawTok[]): PassageToken[] {
  return row.filter(keepTok).map(rawToToken);
}
