import type { LanguageCode } from './types';
import type { StoredBook } from './epubStore';
import { chunkChapter } from './epubChunk';

/**
 * Where you are in a book, and where "next" goes.
 *
 * ONE SOURCE OF TRUTH FOR THE POSITION. The chapter and section live on the book record in
 * IndexedDB (`StoredBook.position`) and nowhere else; localStorage holds only a POINTER to
 * which book is open. Copying the position into localStorage as well would be two records of
 * the same fact, and the moment one is written without the other — a book removed, a section
 * read on another device, a failed write — they disagree and the reader is dropped somewhere
 * they never were.
 *
 * Scoped per language, because the active study language decides how a book is segmented. A
 * Spanish novel auto-opening while you are studying Chinese would hand the Chinese segmenter
 * Spanish prose.
 */

const activeKey = (lang: LanguageCode) => `srsly-epub-active-${lang}`;

export function getActiveBookId(lang: LanguageCode): string | null {
  if (typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(activeKey(lang)); } catch { return null; }
}

export function setActiveBookId(lang: LanguageCode, id: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (id) localStorage.setItem(activeKey(lang), id);
    else localStorage.removeItem(activeKey(lang));
  } catch { /* private mode — the library menu still works */ }
}

/** How many sections a chapter splits into. 0 for a chapter index that does not exist. */
export function sectionCount(book: StoredBook, chapter: number): number {
  return chunkChapter(book.chapters[chapter]?.text ?? '').length;
}

export interface Position { chapter: number; section: number }

/**
 * The next section, crossing into the next chapter when one runs out.
 *
 * Returns null at the end of the book, which is what the caller renders as "no next" rather
 * than a disabled button that lies about there being more.
 *
 * CHAPTERS CAN BE EMPTY. A chapter whose text was stripped to nothing still occupies an
 * index, so advancing has to keep walking rather than landing on a chapter with no sections
 * and reporting section 0 of nothing. That is why this loops instead of adding one.
 */
export function nextPosition(book: StoredBook, chapter: number, section: number): Position | null {
  if (section + 1 < sectionCount(book, chapter)) {
    return { chapter, section: section + 1 };
  }
  for (let c = chapter + 1; c < book.chapters.length; c++) {
    if (sectionCount(book, c) > 0) return { chapter: c, section: 0 };
  }
  return null;
}

/** Human label for a position, used on the button and in the library list. */
export function positionLabel(book: StoredBook, chapter: number, section: number): string {
  const total = sectionCount(book, chapter);
  const title = book.chapters[chapter]?.title ?? `Chapter ${chapter + 1}`;
  return total > 1 ? `${title} (${section + 1}/${total})` : title;
}
