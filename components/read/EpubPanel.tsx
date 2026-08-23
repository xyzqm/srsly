'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeckWord, DailyPassage, LanguageCode } from '@/lib/types';
import { buildEpubSection } from '@/lib/epubSection';
import { setActiveBookId, getActiveBookId } from '@/lib/epubProgress';
import { parseEpub, EpubError } from '@/lib/epub';
import { mismatchWarning } from '@/lib/languageMismatch';
import { chunkChapter } from '@/lib/epubChunk';
import { bookId, putBook, listBooks, removeBook, savePosition, type StoredBook } from '@/lib/epubStore';

/**
 * Read a book, through the same pipeline as everything else.
 *
 * NO IFRAME READER. A section of a chapter is handed to /api/segment-text exactly as pasted
 * text is, comes back as tokens, and renders through PassageText — so every word stays
 * clickable, every blank still works, and the lemmatizers still link 走った to 走る. An
 * embedded reader would render the publisher's own XHTML in a document this app cannot
 * reach, which would cost all of that.
 *
 * A CHAPTER IS NOT A PASSAGE. /api/segment-text caps at 8,000 characters, which is right for
 * an article and a fraction of a chapter, so chunkChapter cuts each one into sections at
 * paragraph boundaries and each section becomes its own passage. That also happens to be the
 * right reading unit: a passage you finish and get results for, rather than a chapter you
 * abandon.
 */

interface Props {
  /**
   * Start expanded, for the card chooser on an empty tab. The panel still owns its open state
   * from then on — this only seeds it, so the collapsed "+ …" button keeps working everywhere
   * else exactly as before.
   */
  startOpen?: boolean;
  language: LanguageCode;
  deck: DeckWord[];
  dueWords: Set<string>;
  blankDensity?: number;
  onCommit: (passage: DailyPassage) => void;
}

const mono = { fontFamily: 'var(--f-mono)' as const };

export default function EpubPanel({ language, deck, dueWords, blankDensity, onCommit, startOpen = false}: Props) {
  const [open, setOpen] = useState(startOpen);
  const [books, setBooks] = useState<StoredBook[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chapterIdx, setChapterIdx] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const refresh = useCallback(async () => {
    try { setBooks(await listBooks(language)); } catch { /* no IndexedDB — the panel stays empty */ }
  }, [language]);
  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  /**
   * Reopen the book you were reading, at the section you stopped on.
   *
   * Only selects it — it does not segment anything. Re-reading a section you already finished
   * the moment you open the tab would be presumptuous and would spend a segment call; the
   * "Next section" button on the results screen is the thing that actually moves you on.
   */
  /**
   * Drop the open book when the study language changes.
   *
   * `activeId` is component state and ReadingSources renders this panel without a `key`, so a
   * Chinese novel stayed selected — and readable — after switching to Spanish, where every one
   * of its words would be looked up in a Spanish dictionary. Clearing it lets the restore
   * effect below pick up `srsly-epub-active-{lang}`, which has been per-language all along.
   *
   * Ref-guarded so it does not fire on mount, and declared BEFORE the restore effect so that
   * within one commit the clear happens first and the restore sees a clean slate.
   */
  const prevLanguage = useRef(language);
  useEffect(() => {
    if (prevLanguage.current === language) return;
    prevLanguage.current = language;
    setActiveId(null);
    setChapterIdx(0);
    setError('');
  }, [language]);

  useEffect(() => {
    if (!open || activeId) return;
    const remembered = getActiveBookId(language);
    if (!remembered) return;
    const book = books.find(b => b.id === remembered);
    if (!book) return;
    setActiveId(book.id);
    setChapterIdx(book.position?.chapter ?? 0);
  }, [open, activeId, books, language]);

  const active = books.find(b => b.id === activeId);

  /**
   * The publisher declares `dc:language`; until now it was parsed and never read.
   *
   * The book is segmented as the ACTIVE STUDY LANGUAGE whatever it actually is, so a Spanish
   * novel opened during a Chinese session is handed to the Chinese segmenter and comes back
   * as character fragments — with no error to explain it. The first chapter's text backs the
   * check up when the metadata is missing or wrong.
   */
  const warning = active
    ? mismatchWarning(language, { declared: active.language, text: active.chapters[0]?.text })
    : null;

  const ingest = useCallback(async (file: File) => {
    setError('');
    setBusy(`Reading ${file.name}…`);
    try {
      const parsed = await parseEpub(await file.arrayBuffer());
      const stored: StoredBook = {
        ...parsed,
        id: bookId(file.name, file.size),
        addedAt: new Date().toISOString(),
        studyLanguage: language,
      };
      await putBook(stored);
      await refresh();
      setActiveId(stored.id);
      setActiveBookId(language, stored.id);
      setChapterIdx(stored.position?.chapter ?? 0);
    } catch (err) {
      // An EpubError is a diagnosis worth showing; anything else is ours and reads as noise.
      setError(err instanceof EpubError ? err.message : 'That file could not be read.');
    } finally {
      setBusy('');
    }
  }, [refresh, language]);

  /** Segment one section and hand it over as a passage, exactly as the paste panel does. */
  const readSection = useCallback(async (book: StoredBook, chapter: number, section: number) => {
    const sections = chunkChapter(book.chapters[chapter]?.text ?? '');
    const text = sections[section];
    if (!text) return;
    setError('');
    setBusy(`Preparing section ${section + 1} of ${sections.length}…`);
    try {
      const passage = await buildEpubSection(book, chapter, section, { language, deck, dueWords, blankDensity });
      if (!passage) return;
      await savePosition(book.id, chapter, section);
      // A book added before `studyLanguage` existed shows on every shelf; reading it is the
      // first unambiguous evidence of which one it belongs to.
      if (!book.studyLanguage) await putBook({ ...book, studyLanguage: language });
      setActiveBookId(language, book.id);   // so the next visit reopens here
      await refresh();
      onCommit(passage);
      setOpen(false);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy('');
    }
  }, [language, deck, dueWords, blankDensity, onCommit, refresh]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = Array.from(e.dataTransfer.files).find(f => f.name.toLowerCase().endsWith('.epub'));
    if (file) void ingest(file);
    else setError('Drop an .epub file.');
  }, [ingest]);

  const btn = (label: string, onClick: () => void, primary = false) => (
    <button
      onClick={onClick}
      className="cursor-pointer transition-all duration-150 rounded-lg whitespace-nowrap"
      style={{
        ...mono, fontSize: 11, letterSpacing: '.06em', padding: '7px 13px',
        background: primary ? 'var(--accent)' : 'none',
        color: primary ? '#fff' : 'var(--ink-soft)',
        border: `1px solid ${primary ? 'var(--accent)' : 'var(--line)'}`,
      }}
    >
      {label}
    </button>
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cursor-pointer transition-all duration-150"
        style={{
          ...mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
          background: 'none', border: '1px dashed var(--line)', borderRadius: 9,
          padding: '9px 15px', color: 'var(--ink-soft)',
        }}
      >
        + Read a book
      </button>
    );
  }

  const sections = active ? chunkChapter(active.chapters[chapterIdx]?.text ?? '') : [];

  return (
    <div className="rounded-xl px-5 py-5 animate-rise" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Read a book
        </span>
        <button onClick={() => setOpen(false)} className="cursor-pointer"
                style={{ ...mono, fontSize: 11, background: 'none', border: 'none', color: 'var(--ink-faint)' }}>
          close
        </button>
      </div>

      {/* Dropzone — also a plain file input, because a file picker is the only way in on
          touch and a drop target alone would be unusable there. */}
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="block rounded-xl text-center cursor-pointer transition-all duration-150"
        style={{
          border: `1px dashed ${dragging ? 'var(--accent)' : 'var(--line)'}`,
          background: dragging ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'var(--card)',
          padding: '20px 16px',
        }}
      >
        <input
          type="file"
          accept=".epub,application/epub+zip"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ingest(f); }}
        />
        <div style={{ ...mono, fontSize: 12, color: 'var(--ink-soft)' }}>
          {busy || 'Drop an EPUB here, or click to choose one'}
        </div>
        <div style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)', marginTop: 5 }}>
          Stays on this device — nothing is uploaded
        </div>
      </label>

      {error && <p style={{ ...mono, fontSize: 11.5, color: 'var(--wrong)', marginTop: 10 }}>{error}</p>}

      {books.length > 0 && (
        <div className="mt-4">
          <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>
            Your books
          </div>
          <div className="flex flex-col gap-1.5">
            {books.map(b => (
              <div key={b.id} className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-2"
                   style={{ background: b.id === activeId ? 'var(--card)' : 'transparent', border: `1px solid ${b.id === activeId ? 'var(--line)' : 'transparent'}` }}>
                <button
                  onClick={() => { setActiveId(b.id); setChapterIdx(b.position?.chapter ?? 0); }}
                  className="cursor-pointer text-left flex-1"
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--ink)' }}
                >
                  <span style={{ fontSize: 14 }}>{b.title}</span>
                  <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)', marginLeft: 8 }}>
                    {b.chapters.length} chapters
                    {b.position ? ` · at ${b.position.chapter + 1}.${b.position.section + 1}` : ''}
                  </span>
                </button>
                <button onClick={() => {
                          void removeBook(b.id).then(refresh);
                          if (activeId === b.id) { setActiveId(null); setActiveBookId(language, null); }
                        }}
                        className="cursor-pointer" style={{ ...mono, fontSize: 10, background: 'none', border: 'none', color: 'var(--ink-faint)' }}>
                  remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {active && (
        <div className="mt-4">
          {warning && (
            <p className="rounded-lg px-3 py-2 mb-3" role="alert"
               style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink)',
                        background: 'color-mix(in srgb, var(--gold) 12%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--gold) 40%, transparent)' }}>
              {warning}
            </p>
          )}
          <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>
            Chapters
          </div>
          <select
            value={chapterIdx}
            onChange={e => setChapterIdx(Number(e.target.value))}
            className="w-full rounded-lg px-3 py-2 mb-3"
            style={{ ...mono, fontSize: 12, background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink)', outline: 'none' }}
          >
            {active.chapters.map((c, i) => (
              <option key={c.id} value={i}>{i + 1}. {c.title}</option>
            ))}
          </select>

          <div className="flex flex-wrap gap-2 items-center">
            {sections.map((_, i) => btn(
              sections.length > 1 ? `Read ${i + 1}/${sections.length}` : 'Read this chapter',
              () => void readSection(active, chapterIdx, i),
              active.position?.chapter === chapterIdx && active.position?.section === i,
            ))}
          </div>
          <p style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)', marginTop: 8, lineHeight: 1.5 }}>
            A chapter is split into sections that fit one reading session. Each becomes a
            passage with its own blanks and results.
          </p>
        </div>
      )}
    </div>
  );
}
