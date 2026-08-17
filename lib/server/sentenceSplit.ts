/**
 * Split pasted prose into sentences, before any of it reaches a segmenter.
 *
 * The generated path never needed this: the model returns `sentences` as an array, already
 * one string per sentence. Pasted text is one blob, and a `Sentence[]` is what the whole
 * reading UI is built on — PassagePlayer walks it to highlight what it is speaking, and
 * `activeSentenceIdx` lights one at a time. A single monster "sentence" would work but would
 * read as an undifferentiated wall with the entire passage highlighted at once.
 *
 * The stakes are low, which is why the rules below are short: a boundary in the wrong place
 * only moves a highlight. Nothing about blank selection, grading or scheduling depends on
 * where a sentence ends.
 */

/** Terminators for scripts written without spaces. `；` ends a clause, but it reads as a
 *  break and CJK sentences are long enough that treating it as one helps. */
const CJK_TERMINATORS = /[。！？!?…‥；;]+["」』）】’”]*/g;

/** Terminators for the spaced languages. The mark must be FOLLOWED by whitespace or the end
 *  of the line, so `1.500` and `www.example.com` stay whole. */
const LATIN_TERMINATORS = /[.!?…]+["»’”)\]]*(?=\s|$)/g;

/**
 * The one abbreviation rule worth having: a lone capital before the period is an initial
 * (`J. K. Rowling`, `M. Dupont`), not the end of a sentence.
 *
 * Deliberately not a list of titles. `Sr.`, `Dr.`, `etc.` and `p. ej.` are real, but every
 * rule short enough to catch them also catches an ordinary short capitalised word that
 * genuinely ends a sentence ("Vive en Roma. Luego…"), and a missed split reads worse than
 * an extra one.
 */
const INITIAL = /(?:^|\s)[A-ZÀ-ÝŒÆ]$/;

function splitLine(line: string, unspaced: boolean): string[] {
  const re = unspaced ? CJK_TERMINATORS : LATIN_TERMINATORS;
  re.lastIndex = 0;
  const out: string[] = [];
  let start = 0;
  for (const m of line.matchAll(re)) {
    const at = m.index ?? 0;
    // Not a boundary after all — leave `start` where it is so the piece grows into the next.
    if (!unspaced && INITIAL.test(line.slice(start, at))) continue;
    const piece = line.slice(start, at + m[0].length).trim();
    if (piece) out.push(piece);
    start = at + m[0].length;
  }
  const tail = line.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Split `text` into sentences. Line breaks are hard boundaries — a pasted article's
 * paragraphs and headings are already separated that way, and running them together across
 * a newline is the one split error that produces visible nonsense.
 */
export function splitSentences(text: string, unspaced: boolean): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap(line => splitLine(line.trim(), unspaced))
    .filter(Boolean);
}
