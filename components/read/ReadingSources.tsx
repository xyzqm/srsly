'use client';
import { useEffect, useState } from 'react';
import type { DeckWord, DailyPassage, LanguageCode } from '@/lib/types';
import PasteTextPanel from './PasteTextPanel';
import Mark, { type MarkName } from '@/components/shared/Mark';
import EpubPanel from './EpubPanel';

/**
 * The ways to get something to read.
 *
 * TWO SHAPES, and the difference is the whole design:
 *
 * - **Nothing to read yet** → the cards, laid out as the primary content of the screen.
 *   There is nothing else on an empty tab, so the chooser IS the screen and hiding it behind
 *   a click hides the only thing worth doing.
 *
 *   It used to LEAD with a starter text, on the reasoning that the other cards all ask the
 *   learner to supply something and a first session that cannot start is the whole funnel.
 *   That card was removed on request. The reasoning was not wrong and is worth keeping
 *   written down: an empty tab now offers paste, upload and generate, and all three want
 *   something the learner does not have in front of them yet. `StarterPanel` and
 *   `lib/data/starterTexts.ts` are left in the tree, unreferenced, so putting it back is one
 *   line rather than re-authoring twelve texts.
 * - **Already reading** → one "+ Add reading" button. Once a passage is on screen the chooser
 *   is furniture, and it grew by one every time a source was added.
 *
 * An earlier pass collapsed BOTH states to the single button, on the reasoning that one
 * control should look the same wherever you meet it. That was right about consistency and
 * wrong about the empty tab, where it left a beginner with a bare screen, a disabled Generate
 * button and no way in. What made the old empty tab bad was three identical unlabelled dashed
 * buttons, not the fact that the options were visible — cards with icons and a line of
 * explanation are a different thing.
 */

interface Props {
  language: LanguageCode;
  deck: DeckWord[];
  dueWords: Set<string>;
  blankDensity?: number;
  onCommit: (passage: DailyPassage) => void;
  /**
   * Where a BOOK section goes. Separate from `onCommit` because a book is not another article
   * in the list — it has its own place, its own position, and its own way out. See ReadTab.
   */
  onCommitBook: (passage: DailyPassage) => void;
  /** True when the tab has no passage — the chooser then leads the screen. */
  emptyTab: boolean;
  /** An article sent in by the web clipper — opens the paste source with it loaded. */
  clip?: { title: string; text: string } | null;
  /**
   * True while a share in the URL is still being decoded (see ReadTab's `shareStatus`).
   *
   * IT OPENS THE PASTE PANEL ON THE FIRST FRAME, BEFORE THE TEXT EXISTS. `clip` arrives a tick
   * late now that decoding is asynchronous, so without this the learner opening a shared link
   * sees the reading chooser — "pick something to read" — and then watches it be replaced. The
   * panel is where the text is going either way, so putting it there immediately means the text
   * fills in rather than the layout changing its mind.
   */
  pendingShare?: boolean;
}

type Source = 'paste' | 'epub';

const CARDS: { id: Source; mark: MarkName; label: string; hint: string }[] = [
  { id: 'paste', mark: 'page', label: 'Paste text',        hint: 'Anything you already want to read' },
  { id: 'epub',  mark: 'book', label: 'Upload a book',     hint: 'EPUB — read a chapter at a time' },
];

const mono = { fontFamily: 'var(--f-mono)' } as const;

export default function ReadingSources({ language, deck, dueWords, blankDensity, onCommit, onCommitBook, emptyTab, clip = null, pendingShare = false }: Props) {
  const [open, setOpen] = useState(pendingShare);
  const [source, setSource] = useState<Source | null>(pendingShare ? 'paste' : null);
  /**
   * A file dropped straight onto the empty library, before any source was chosen.
   *
   * The dropzone lives where the learner meets it rather than two clicks in, so the file
   * arrives BEFORE the panel that reads it exists. It is held here for exactly one render and
   * handed down; `EpubPanel` ingests it once and ignores it thereafter.
   */
  const [dropped, setDropped] = useState<File | null>(null);

  /**
   * Fold away once something arrives to read — otherwise the chooser stays expanded above the
   * passage it just produced, which is the clutter it exists to remove.
   *
   * `!clip` IS LOAD-BEARING AND WAS MISSING, WHICH SILENTLY ATE SHARED ARTICLES. `emptyTab` is
   * false whenever the day already holds a passage, and the day's cache is read ASYNCHRONOUSLY —
   * so on a load that arrives with a clip, the sequence is: the clip effect below opens the
   * panel, then the cache resolves, `emptyTab` flips true → false, this effect re-runs, and it
   * closes the panel the clip is sitting in. The hash has already been consumed and cleared by
   * then, so the article is gone with no error anywhere: the link "does nothing", which is the
   * exact bug report this codebase has already filed once about a dead button.
   *
   * Found by opening a real share link with a passage already cached, after the same link worked
   * perfectly on an empty tab. It is not new — a v1 clip lost the same race, because the cache
   * always resolves after mount — it was just much rarer to meet before there was a Share button
   * inviting it.
   */
  useEffect(() => { if (!emptyTab && !clip) { setOpen(false); setSource(null); } }, [emptyTab, clip]);

  /**
   * A clip is a source already chosen: skip the four cards and open paste with it loaded.
   *
   * Keyed on `language` as well as the clip, because a clip can CAUSE a language switch — it
   * carries the language of the page it came from. The switch re-renders everything beneath
   * it, and without this the panel closed and the clipped text was silently dropped, leaving
   * the reader to open Paste and paste it again by hand. Re-asserting is safe: ReadTab clears
   * the clip once it has been committed.
   */
  useEffect(() => { if (clip) { setOpen(true); setSource('paste'); } }, [clip, language]);

  const panelProps = { language, deck, dueWords, blankDensity, onCommit };

  function panel(s: Source) {
    if (s === 'paste') return <PasteTextPanel {...panelProps} startOpen clip={clip} />;
    return <EpubPanel {...panelProps} onCommit={onCommitBook} startOpen />;
  }

  const back = (
    <button
      onClick={() => setSource(null)}
      className="cursor-pointer"
      style={{ ...mono, fontSize: 11, background: 'none', border: 'none', padding: 0, color: 'var(--ink-faint)', alignSelf: 'flex-start' }}
    >
      ← all reading options
    </button>
  );

  /* ── Empty tab: the chooser leads the screen ─────────────────────────────── */
  if (emptyTab) {
    if (source) {
      return (
        <div className="flex flex-col gap-3 w-full">
          {back}
          {source === 'epub'
            ? <EpubPanel {...panelProps} onCommit={onCommitBook} startOpen initialFile={dropped} />
            : panel(source)}
        </div>
      );
    }
    return <EmptyLibrary onPick={setSource} onDropFile={f => { setDropped(f); setSource('epub'); }} />;
  }

  /* ── Reading already: one button ─────────────────────────────────────────── */
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
        + Add reading
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-start w-full">
      <button
        onClick={() => { setOpen(false); setSource(null); }}
        className="cursor-pointer"
        style={{ ...mono, fontSize: 10.5, background: 'none', border: 'none', padding: 0, color: 'var(--ink-faint)' }}
      >
        − hide
      </button>
      {source ? (
        <>{back}{panel(source)}</>
      ) : (
        <div className="grid gap-2 w-full" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {CARDS.map(c => (
            <button
              key={c.id}
              onClick={() => setSource(c.id)}
              className="cursor-pointer transition-all duration-150 text-left"
              style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}
            >
              <span className="inline-flex items-center gap-2">
                <span style={{ color: 'var(--ink-faint)', display: 'inline-flex' }}><Mark name={c.mark} size={15} /></span>
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>{c.label}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * THE EMPTY LIBRARY — the screen that has to make somebody want to bring their own reading.
 *
 * ## WHAT IT REPLACED, AND WHY THAT WAS NOT GOOD ENOUGH
 *
 * Two small cards reading "Paste text" and "Upload a book", side by side, under a mono label.
 * Nothing was broken about them and they were still the weakest screen in the app: this tab
 * carries the whole argument — *read what you actually want to read* — and it opened with two
 * grey boxes that each asked the learner to go and find something first, with no sense of what
 * would happen once they did.
 *
 * ## THE DROPZONE IS REAL, AND IT WAS ALREADY BUILT TWO CLICKS AWAY
 *
 * `EpubPanel` has always had a drag-and-drop target with its own drag state. It was behind a
 * card, so dragging a book onto the empty tab did nothing — the one gesture somebody with an
 * EPUB in a folder would actually try. It is hoisted here: the file is caught before the panel
 * that reads it exists, held for one render, and handed down through `initialFile`.
 *
 * ## AND THE THREE STEPS ARE THE PART A BEGINNER IS MISSING
 *
 * The cards said what to GIVE and never what you GET. Tapping a word to schedule it is the
 * entire loop of this app and is invisible until you have already done it once — so it is
 * stated, in three short steps, on the screen where somebody is deciding whether to bother.
 */
function EmptyLibrary({ onPick, onDropFile }: {
  onPick: (s: Source) => void;
  onDropFile: (f: File) => void;
}) {
  const [dragging, setDragging] = useState(false);

  /*
    `dragenter`/`dragover` must BOTH preventDefault or the browser navigates to the file
    instead, replacing the app with a raw EPUB download. `dragleave` fires when the pointer
    crosses onto a CHILD element, so the highlight is cleared on drop and on leaving the
    element itself rather than on every internal boundary.
  */
  const stop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <div className="w-full">
      <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, letterSpacing: '-.015em',
        color: 'var(--ink)', margin: '0 0 6px', lineHeight: 1.2 }}>
        Read what you actually want to read.
      </h3>
      <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, margin: '0 0 20px', maxWidth: '52ch' }}>
        Bring an article, a chapter, a whole book. srsly splits it into words, defines every one
        of them, and keeps the ones you tap.
      </p>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {/* ── The dropzone. Larger than its neighbour on purpose: it is the only one of the
            two that can be used by doing nothing more than dragging. ── */}
        <label
          onDragEnter={e => { stop(e); setDragging(true); }}
          onDragOver={stop}
          onDragLeave={e => { stop(e); if (e.currentTarget === e.target) setDragging(false); }}
          onDrop={e => {
            stop(e);
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            // Anything else falls through to the panel's own error, which names the problem.
            if (f) onDropFile(f);
          }}
          className="cursor-pointer transition-all duration-150 flex flex-col items-center justify-center text-center"
          style={{
            borderRadius: 14, padding: '30px 20px', minHeight: 188,
            border: `1.5px dashed ${dragging ? 'var(--accent)' : 'var(--line)'}`,
            background: dragging ? 'var(--accent-soft)' : 'var(--paper-2)',
          }}
        >
          <input
            type="file"
            accept=".epub,application/epub+zip"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onDropFile(f); }}
          />
          <div style={{ color: dragging ? 'var(--accent)' : 'var(--ink-soft)', marginBottom: 11 }}>
            <Mark name="book" size={27} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>
            {dragging ? 'Drop it' : 'Drop a book here'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.5, maxWidth: '26ch' }}>
            EPUB, read a chapter at a time — or click to choose one
          </div>
          {/* The promise this panel has always made, said where the file is handed over
              rather than after. */}
          <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase',
            color: 'var(--ink-faint)', marginTop: 12 }}>
            Stays on this device
          </div>
        </label>

        {/* ── Paste. A real text affordance rather than a label: the box is what it does. ── */}
        <button
          onClick={() => onPick('paste')}
          className="cursor-pointer transition-all duration-150 text-left flex flex-col"
          style={{
            borderRadius: 14, padding: '20px', minHeight: 188,
            border: '1px solid var(--line)', background: 'var(--card)',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
        >
          <div style={{ color: 'var(--ink-soft)', marginBottom: 10 }}><Mark name="page" size={24} /></div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>Paste text</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.5 }}>
            An article, a song, a page of a book — anything you already want to read.
          </div>
          {/* A stand-in for the field it opens, so the card SHOWS what pressing it gives you.
              `aria-hidden`: it is a picture of an input, and a screen reader meeting a second
              fake textbox inside a button would be told something untrue. */}
          <div
            aria-hidden
            className="mt-auto w-full"
            style={{ borderRadius: 9, border: '1px dashed var(--line)', background: 'var(--paper-2)',
              padding: '10px 12px', marginTop: 16 }}
          >
            <div style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)' }}>Paste here…</div>
          </div>
        </button>
      </div>

      {/* ── WHAT HAPPENS NEXT. The cards said what to give and never what you get. ── */}
      <ol className="grid gap-x-6 gap-y-3 mt-7" style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', listStyle: 'none', padding: 0, margin: 0,
      }}>
        {[
          ['Tap any word', 'Definition, how it sounds, and the grammar it is doing.'],
          ['Save the ones you want', 'They go into your deck with a review scheduled.'],
          ['They come back', 'Spaced out, just before you would have forgotten.'],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span aria-hidden className="shrink-0 flex items-center justify-center rounded-full"
              style={{ ...mono, fontSize: 10, width: 21, height: 21, marginTop: 1,
                border: '1px solid var(--line)', color: 'var(--ink-faint)' }}>
              {i + 1}
            </span>
            <span className="min-w-0">
              <span style={{ fontSize: 13, color: 'var(--ink)', display: 'block', fontWeight: 500 }}>{title}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginTop: 2, lineHeight: 1.5 }}>
                {body}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
