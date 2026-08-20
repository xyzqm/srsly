import { MAX_PASTE_CHARS } from './constants';

/**
 * Cut a chapter into pieces the reading pipeline can actually take.
 *
 * /api/segment-text refuses anything over MAX_PASTE_CHARS (8,000) and caps at 400 sentences,
 * which is right for a pasted article and far below a chapter of a novel. So a chapter
 * becomes a sequence of SECTIONS, each one a passage in its own right.
 *
 * SPLIT ON PARAGRAPHS, NEVER MID-SENTENCE. `parseEpub` emits one paragraph per line, and a
 * section that ends halfway through a sentence would hand the segmenter a fragment: the
 * lemmatizer would see a truncated final word and the reader would get a passage that stops
 * mid-clause. A paragraph longer than the whole budget is the one case that has to break
 * anyway, and it breaks at sentence ends.
 */

/** Leaves room under the hard limit so a long final paragraph never tips a section over. */
const TARGET = Math.floor(MAX_PASTE_CHARS * 0.75);

/** Sentence terminators, both scripts — the fallback boundary for an overlong paragraph. */
const SENTENCE_END = /(?<=[.!?…。！？])\s+/;

function splitLongParagraph(para: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const piece of para.split(SENTENCE_END)) {
    if (cur && cur.length + piece.length + 1 > TARGET) { out.push(cur); cur = ''; }
    cur = cur ? `${cur} ${piece}` : piece;
    // A single sentence over the budget (no terminators at all, or one enormous one) is cut
    // hard rather than dropped — losing text silently would be worse than an awkward break.
    while (cur.length > MAX_PASTE_CHARS) {
      out.push(cur.slice(0, TARGET));
      cur = cur.slice(TARGET);
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Sections of at most MAX_PASTE_CHARS, in reading order.
 *
 * Returns [] for an empty chapter rather than one empty section, so a caller can treat
 * "nothing to read" as a count.
 */
export function chunkChapter(text: string): string[] {
  const paragraphs = text.split('\n').map(p => p.trim()).filter(Boolean);
  const sections: string[] = [];
  let cur = '';

  for (const para of paragraphs) {
    if (para.length > TARGET) {
      if (cur) { sections.push(cur); cur = ''; }
      sections.push(...splitLongParagraph(para));
      continue;
    }
    if (cur && cur.length + para.length + 1 > TARGET) { sections.push(cur); cur = ''; }
    cur = cur ? `${cur}\n${para}` : para;
  }
  if (cur) sections.push(cur);
  return sections;
}
