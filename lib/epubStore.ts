import type { EpubBook } from './epub';
import type { LanguageCode } from './types';
import { languageFromTag } from './languageMismatch';

/**
 * Books live in IndexedDB, not localStorage.
 *
 * A novel is a few megabytes of text. localStorage caps around 5 MB for the WHOLE origin and
 * already holds every deck, the daily content cache, the shelf and the prefs — one book would
 * evict all of it, and the failure mode is a thrown QuotaExceededError in the middle of
 * saving someone's vocabulary. IndexedDB is the store meant for this size and is the reason
 * EPUB was deferred until it could be done properly.
 *
 * The API is deliberately tiny: put, list, get, remove. Chapters are stored inside the book
 * record rather than as their own table, because nothing ever wants one chapter without
 * knowing which book it came from, and a book is read start to finish.
 */

const DB = 'srsly-books';
const STORE = 'books';
const VERSION = 1;

export interface StoredBook extends EpubBook {
  /** Stable per upload — the file name plus its size, so re-adding the same file replaces it. */
  id: string;
  addedAt: string;
  /** Where the reader got to: chapter index and section index within it. */
  position?: { chapter: number; section: number };
  /**
   * The language being STUDIED when this book was added — deliberately not the publisher's
   * `dc:language`, which is unreliable enough to have its own essay in lib/languageMismatch.ts
   * (a Chinese book may declare `简体中文`, or nothing at all). This is a value we chose, so
   * it can be trusted to scope the shelf.
   *
   * Undefined on books added before the field existed. Those stay visible in every language
   * rather than vanishing from the shelf, and are stamped on first read.
   */
  studyLanguage?: LanguageCode;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  }));
}

/** Identity is the file, so dropping the same book twice updates it rather than duplicating. */
export function bookId(fileName: string, size: number): string {
  return `${fileName}:${size}`;
}

export async function putBook(book: StoredBook): Promise<void> {
  await run('readwrite', s => s.put(book));
}

/**
 * Which shelf a book belongs on, or undefined when there is genuinely no way to tell.
 *
 * `studyLanguage` is our own stamp and always wins. Failing that we will accept the
 * publisher's `dc:language`, but ONLY when it parses as a tag for a language we teach — which
 * is what `languageFromTag` checks and what keeps `简体中文` and `Chinese` out of this. That
 * is enough to scope most books added before the stamp existed, so a Chinese novel does not
 * sit on the Spanish shelf waiting to be opened once before it settles.
 */
export function shelfLanguage(book: StoredBook): LanguageCode | undefined {
  return book.studyLanguage ?? languageFromTag(book.language);
}

/**
 * The shelf for one study language, newest first.
 *
 * Filtering here rather than at the call site keeps the legacy rule in one place: a book we
 * cannot place at all shows on every shelf rather than vanishing, and is stamped the first
 * time it is read. Omit `language` to get every book.
 */
export async function listBooks(language?: LanguageCode): Promise<StoredBook[]> {
  const all = await run<StoredBook[]>('readonly', s => s.getAll());
  const mine = language
    ? all.filter(b => { const l = shelfLanguage(b); return l === undefined || l === language; })
    : all;
  return mine.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export async function getBook(id: string): Promise<StoredBook | undefined> {
  return run<StoredBook | undefined>('readonly', s => s.get(id));
}

export async function removeBook(id: string): Promise<void> {
  await run('readwrite', s => s.delete(id));
}

/** Remember where the reader stopped. Written on every section open, so it stays cheap. */
export async function savePosition(id: string, chapter: number, section: number): Promise<void> {
  const book = await getBook(id);
  if (!book) return;
  await putBook({ ...book, position: { chapter, section } });
}
