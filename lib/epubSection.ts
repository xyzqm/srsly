import type { DeckWord, DailyPassage, LanguageCode } from './types';
import type { RawTok } from './server/kuromojiSegmenter';
import type { StoredBook } from './epubStore';
import { buildPastedPassage } from '@/hooks/useDailyContent';
import { chunkChapter } from './epubChunk';
import { positionLabel } from './epubProgress';

/**
 * Turn one section of a chapter into a passage.
 *
 * SHARED BY BOTH DOORS. The library panel opens a section, and "Next section" on the results
 * screen opens the one after it; if each built its own passage the two would eventually
 * disagree about blank selection or the title format, and the difference would only show up
 * as a book that reads differently depending on how you got to the page.
 *
 * It is the same call the paste panel makes, so a book section is blanked by the same rules,
 * against the same due words and the same daily new-card ledger, as anything else.
 */
export async function buildEpubSection(
  book: StoredBook,
  chapter: number,
  section: number,
  opts: {
    language: LanguageCode;
    deck: DeckWord[];
    dueWords: Set<string>;
    blankDensity?: number;
  },
): Promise<DailyPassage | null> {
  const text = chunkChapter(book.chapters[chapter]?.text ?? '')[section];
  if (!text) return null;

  const res = await fetch('/api/segment-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      title: positionLabel(book, chapter, section),
      language: opts.language,
      words: opts.deck.map(w => ({ h: w.h, p: w.p, m: w.m })),
      names: [],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
  }

  const raw = await res.json() as { title: RawTok[]; sentences: RawTok[][] };
  /**
   * `vocabWords: []` — a book has NO BLANKS and touches no schedule.
   *
   * Blanks exist because a generated passage is written around the words you owe today; that
   * is a contract the app made with itself and can therefore test you on. A book you chose
   * carries no such contract — you are reading it because you want to read it, and turning a
   * novel into an exercise is how reading stops being the reward.
   *
   * Words still enter the deck from here, but only when you tap one and press Add to deck.
   * Reading still counts toward the streak: reading is studying.
   */
  return { ...buildPastedPassage(raw, opts.deck, opts.language, []), vocabWords: [] };
}
