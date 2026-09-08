"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeckWord } from '@/lib/types';
import { strokeDataUrl } from '@/lib/hanziWriter';
import {
  buildRows, paginate, rowCells, strokeBuildUp,
  CELL_MM, STROKE_BOX_MM, GLYPH_BOX, GLYPH_SLACK, GLYPH_VIEWBOX, GLYPH_TRANSFORM,
  strokeUnits, LINE_MM, DASH_MM,
  type SheetRow,
} from '@/lib/practiceSheet';

/**
 * 田字格 practice paper, generated from the deck and printed by the browser.
 *
 * ── window.print(), NOT A PDF LIBRARY ──
 * The obvious build is jsPDF or pdfmake, and it is wrong for this app specifically: a PDF
 * library has to draw 水 itself, which means EMBEDDING A CJK FONT — megabytes, in a codebase
 * whose stated discipline is holding first-load JS near 300 kB, to draw characters we already
 * ship as vector outlines. The browser is already a renderer, every OS print dialog has "Save
 * as PDF" (including iOS Safari's share sheet, which is the iPad story), and everything here
 * is paths and text, so the PDF comes out vector and crisp at any size. One code path serves
 * print and PDF both, so there is one thing to test rather than two.
 *
 * The costs, stated rather than discovered later: page breaks are CSS's decision, the browser
 * adds its own header and footer unless the learner unticks it, and margins come from the
 * dialog. For practice paper that is all acceptable.
 *
 * ── THE CHARACTERS COME FROM OUR OWN STROKE DATA, AND NO LIBRARY IS LOADED ──
 * A file in `public/strokes/` is a list of plain SVG path strings, so drawing one needs a
 * `<path>` and the vertical flip in `lib/practiceSheet.ts` — `hanzi-writer` itself never
 * loads, and its 36 kB chunk stays where it is. Two things follow that setting the character
 * as text in `--f-han` could not give: the sheet and the writing quiz use the SAME glyphs, so
 * they cannot disagree about stroke forms, and the stroke-order band becomes possible at all.
 *
 * ── IT GRADES NOTHING ──
 * No FSRS write, no schedule, no streak, no heatmap. That is the whole reason paper practice
 * is allowed to exist: a sheet filled in at a desk is not something the app watched, so it
 * must not produce a review the scheduler cannot tell apart from an observed one.
 * `tests/practiceSheet.test.ts` pins it.
 */

interface Props {
  /** Every writable character in the deck, in deck order. */
  allChars: readonly string[];
  /** The subset due for writing today. */
  dueChars: readonly string[];
  deck: readonly DeckWord[];
  onClose: () => void;
}

const mono = { fontFamily: 'var(--f-mono)' } as const;

/** Derived from the glyph box so the grid and the character cannot drift apart. */
const VB_MIN = -GLYPH_SLACK;
const VB_SIZE = GLYPH_BOX + 2 * GLYPH_SLACK;
/** The viewBox is symmetric about the glyph box, so its centre is the glyph's centre. */
const MID = GLYPH_BOX / 2;

/**
 * Line weights, converted from millimetres for the box each one is drawn in.
 *
 * NOT hardcoded units. The two box sizes share one viewBox, so a raw stroke-width means two
 * different physical lines — see `LINE_MM` in lib/practiceSheet.ts for the bug that caused.
 */
const CELL_FRAME = strokeUnits(LINE_MM.cellFrame, CELL_MM);
const CELL_CROSS = strokeUnits(LINE_MM.cellCross, CELL_MM);
const BAND_FRAME = strokeUnits(LINE_MM.bandFrame, STROKE_BOX_MM);
const DASH = `${strokeUnits(DASH_MM.on, CELL_MM)} ${strokeUnits(DASH_MM.off, CELL_MM)}`;

/** Inset by half the stroke, so the frame's OUTER edge lands on the viewBox boundary. */
const cellInset = VB_MIN + CELL_FRAME / 2;
const cellSpan = VB_SIZE - CELL_FRAME;
const bandInset = VB_MIN + BAND_FRAME / 2;
const bandSpan = VB_SIZE - BAND_FRAME;

export default function PracticeSheet({ allChars, dueChars, deck, onClose }: Props) {
  const [source, setSource] = useState<'due' | 'all'>(dueChars.length > 0 ? 'due' : 'all');
  const [limit, setLimit] = useState(14);
  const [hideModels, setHideModels] = useState(false);
  const [strokeData, setStrokeData] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const chosen = useMemo(
    () => (source === 'due' ? dueChars : allChars).slice(0, limit),
    [source, dueChars, allChars, limit],
  );

  /**
   * Fetched in parallel and cached across changes to the controls.
   *
   * ~2.4 kB per character, and mostly already in the browser cache from the writing quiz,
   * which reads the same files. Sequential awaits would make raising the count feel like a
   * page load; `Promise.all` makes it one round trip's worth of wait.
   */
  useEffect(() => {
    const missing = chosen.filter(c => !(c in strokeData));
    if (missing.length === 0) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    void Promise.all(missing.map(async c => {
      try {
        const res = await fetch(strokeDataUrl(c));
        if (!res.ok) return [c, [] as string[]] as const;
        const json = await res.json() as { strokes?: string[] };
        return [c, json.strokes ?? []] as const;
      } catch {
        // A character we cannot fetch is reported as unavailable, never drawn as an empty box.
        return [c, [] as string[]] as const;
      }
    })).then(pairs => {
      if (!alive) return;
      setStrokeData(prev => ({ ...prev, ...Object.fromEntries(pairs) }));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [chosen, strokeData]);

  const { rows, skipped } = useMemo(
    () => buildRows(chosen, strokeData, deck),
    [chosen, strokeData, deck],
  );
  const pages = useMemo(() => paginate(rows), [rows]);
  const cells = useMemo(() => rowCells(hideModels), [hideModels]);

  /** Escape closes, as it does for the sign-in modal. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const print = useCallback(() => window.print(), []);
  const maxAvailable = (source === 'due' ? dueChars : allChars).length;

  return (
    <div
      className="ps-root"
      style={{
        position: 'fixed', inset: 0, zIndex: 9998, background: 'var(--paper)',
        overflowY: 'auto', padding: '0 0 40px',
      }}
    >
      {/* CONTROLS — `ps-chrome` is what the print stylesheet removes. */}
      <div
        className="ps-chrome"
        style={{
          position: 'sticky', top: 0, zIndex: 2, background: 'var(--card)',
          borderBottom: '1px solid var(--line)', padding: '14px 20px',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
        }}
      >
        <div style={{ ...mono, fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Practice sheet
        </div>

        <Segmented
          value={source}
          onChange={v => setSource(v as 'due' | 'all')}
          options={[
            { value: 'due', label: `Due (${dueChars.length})` },
            { value: 'all', label: `All (${allChars.length})` },
          ]}
        />

        <label style={{ ...mono, fontSize: 11.5, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 7 }}>
          Characters
          <input
            type="number" min={1} max={Math.max(1, maxAvailable)} value={limit}
            onChange={e => setLimit(Math.max(1, Math.min(Number(e.target.value) || 1, 200)))}
            style={{
              width: 60, padding: '5px 7px', borderRadius: 6, border: '1px solid var(--line)',
              background: 'var(--paper)', color: 'var(--ink)', ...mono, fontSize: 12,
            }}
          />
        </label>

        {/* THE RECALL SWITCH. With the models hidden the sheet stops being a copying exercise
            and becomes a recall one — which is why the answer key appears at the foot of the
            page rather than nowhere. */}
        <label style={{ ...mono, fontSize: 11.5, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
          <input type="checkbox" checked={hideModels} onChange={e => setHideModels(e.target.checked)} />
          Hide models (recall)
        </label>

        <div style={{ flex: 1 }} />

        <button
          onClick={print}
          disabled={loading || rows.length === 0}
          className="cursor-pointer"
          style={{
            ...mono, fontSize: 11.5, letterSpacing: '.1em', textTransform: 'uppercase',
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '9px 18px', boxShadow: '0 2px 0 var(--accent-deep)',
            opacity: loading || rows.length === 0 ? 0.5 : 1,
          }}
        >
          Print / Save PDF
        </button>
        <button
          onClick={onClose}
          className="cursor-pointer"
          style={{
            ...mono, fontSize: 11.5, padding: '9px 14px', borderRadius: 8,
            border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)',
          }}
        >
          Close
        </button>
      </div>

      {loading && (
        <div style={{ ...mono, fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', padding: 40 }}>
          Loading strokes…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: 40, maxWidth: '38ch', margin: '0 auto', lineHeight: 1.6 }}>
          Nothing to put on a sheet yet. Characters come from the words in your deck — read
          something and tap a word to add it.
        </div>
      )}

      {!loading && pages.map((page, pi) => (
        <div
          key={pi}
          className="ps-page"
          style={{
            background: '#fff', color: '#111', margin: '20px auto', padding: '12mm',
            width: '210mm', maxWidth: '100%', boxSizing: 'border-box',
            boxShadow: '0 2px 14px rgba(0,0,0,.10)', border: '1px solid var(--line)',
          }}
        >
          <div className="ps-head" style={{ ...mono, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#666', marginBottom: '6mm', display: 'flex', justifyContent: 'space-between' }}>
            <span>srsly · handwriting practice</span>
            <span>{pages.length > 1 ? `${pi + 1} / ${pages.length}` : ''}</span>
          </div>

          {page.map((row, i) => (
            <Row key={row.char} row={row} n={i + 1} cells={cells} hideModels={hideModels} />
          ))}

          {/* THE ANSWER KEY, and only when it is needed. A recall exercise you cannot mark
              yourself against is a worksheet with no answers. */}
          {hideModels && (
            <div className="ps-key" style={{ marginTop: '8mm', paddingTop: '3mm', borderTop: '1px solid #ccc' }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: '#888', marginBottom: '2mm' }}>
                Answers — fold under
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4mm' }}>
                {page.map((row, i) => (
                  <span key={row.char} style={{ ...mono, fontSize: 10, color: '#444', display: 'inline-flex', alignItems: 'center', gap: '1.5mm' }}>
                    {i + 1}.
                    <svg width="7mm" height="7mm" viewBox={GLYPH_VIEWBOX} className="ps-model" style={{ color: '#222' }}>
                      <Glyph strokes={row.strokes} />
                    </svg>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {!loading && skipped.length > 0 && (
        <div className="ps-chrome" style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center', padding: '0 20px 20px', maxWidth: '60ch', margin: '0 auto', lineHeight: 1.6 }}>
          No stroke data for {skipped.join(' ')} — left off the sheet rather than printed as an
          empty box. Stroke data covers the 2,663 HSK characters, the same set the writing quiz uses.
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── one row ─────────────────────────────────── */

function Row({ row, n, cells, hideModels }: {
  row: SheetRow; n: number; cells: ReturnType<typeof rowCells>; hideModels: boolean;
}) {
  const band = strokeBuildUp(row.strokes);
  return (
    <div className="ps-row" style={{ marginBottom: '6mm' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4mm', marginBottom: '1.5mm', minHeight: `${STROKE_BOX_MM}mm` }}>
        <div style={{ ...mono, fontSize: 10, color: '#333', whiteSpace: 'nowrap' }}>
          {/* Numbered, so a row can be matched against the answer key without counting. */}
          <span style={{ color: '#999', marginRight: '1.5mm' }}>{n}.</span>
          {/* The character itself is withheld in recall mode — printing it in the label would
              hand over exactly what the blank cells are asking for. */}
          {!hideModels && <span style={{ fontFamily: 'var(--f-han)', fontSize: 13, marginRight: '2mm' }}>{row.char}</span>}
          {row.pinyin && <span style={{ color: '#555' }}>{row.pinyin}</span>}
          {row.meaning && <span style={{ color: '#888' }}>{row.pinyin ? ' · ' : ''}{row.meaning}</span>}
          {/* WHICH character of the word, and only when it is load-bearing. 朋 and 友 both
              label as "péngyou · friend", so without this a recall sheet asks the same
              question twice and accepts either answer for both. */}
          {hideModels && row.of > 1 && (
            <span style={{ color: '#aaa' }}> — {ordinal(row.index)} of {row.of}</span>
          )}
        </div>
        {/* THE STROKE-ORDER BAND — the one thing a font could not draw. Withheld in recall
            mode for the same reason as the label. */}
        {!hideModels && (
          <div style={{ display: 'flex', gap: '1mm' }}>
            {band.map((upTo, i) => (
              <svg key={i} width={`${STROKE_BOX_MM}mm`} height={`${STROKE_BOX_MM}mm`} viewBox={GLYPH_VIEWBOX} style={{ flexShrink: 0 }}>
                <rect className="ps-grid" x={bandInset} y={bandInset} width={bandSpan} height={bandSpan}
                  fill="none" stroke="currentColor" strokeWidth={BAND_FRAME} style={{ color: '#ddd' }} />
                <Glyph strokes={upTo} className="ps-model" color="#333" />
              </svg>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {cells.map((kind, i) => (
          <Cell key={i} kind={kind} strokes={row.strokes} first={i === 0} />
        ))}
      </div>
    </div>
  );
}

/** One 田字格 box: the square, its dashed cross-hairs, and whatever character goes in it. */
function Cell({ kind, strokes, first }: { kind: 'model' | 'trace' | 'blank'; strokes: string[]; first: boolean }) {
  return (
    <svg
      width={`${CELL_MM}mm`} height={`${CELL_MM}mm`} viewBox={GLYPH_VIEWBOX}
      // Overlapped by exactly one frame width, so neighbouring cells share ONE ruled edge
      // instead of printing a double line with a hairline gap down the middle.
      style={{ flexShrink: 0, marginLeft: first ? 0 : `-${LINE_MM.cellFrame}mm` }}
    >
      {/* Drawn as SVG rather than CSS borders, so the whole cell is ONE vector object that
          prints predictably — browsers strip background colours when printing but honour
          stroke and fill. */}
      <g className="ps-grid" style={{ color: '#bbb' }}>
        <rect x={cellInset} y={cellInset} width={cellSpan} height={cellSpan}
          fill="none" stroke="currentColor" strokeWidth={CELL_FRAME} />
        {/* THE CROSS IS WHAT MAKES IT A 田字格 rather than a box. */}
        <line x1={MID} y1={cellInset} x2={MID} y2={cellInset + cellSpan}
          stroke="currentColor" strokeWidth={CELL_CROSS} strokeDasharray={DASH} />
        <line x1={cellInset} y1={MID} x2={cellInset + cellSpan} y2={MID}
          stroke="currentColor" strokeWidth={CELL_CROSS} strokeDasharray={DASH} />
      </g>
      {kind !== 'blank' && (
        <Glyph
          strokes={strokes}
          className={kind === 'model' ? 'ps-model' : 'ps-trace'}
          color={kind === 'model' ? '#111' : '#d2d2d2'}
        />
      )}
    </svg>
  );
}

/**
 * The character itself — the paths straight out of `public/strokes/`, flipped.
 *
 * `fill="currentColor"` rather than a literal, so one CSS rule in the print stylesheet can
 * force the whole sheet to ink-on-white without touching this component.
 */
function ordinal(n: number): string {
  return ['1st', '2nd', '3rd', '4th', '5th', '6th'][n - 1] ?? `${n}th`;
}

function Glyph({ strokes, className, color }: { strokes: readonly string[]; className?: string; color?: string }) {
  return (
    <g className={className} style={color ? { color } : undefined} transform={GLYPH_TRANSFORM}>
      {strokes.map((d, i) => <path key={i} d={d} fill="currentColor" />)}
    </g>
  );
}

/* ─────────────────────────── small control ─────────────────────────────── */

function Segmented({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="cursor-pointer"
            style={{
              ...mono, fontSize: 11, letterSpacing: '.06em', padding: '6px 11px', borderRadius: 7,
              border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
              background: on ? 'var(--accent-soft)' : 'var(--card)',
              color: on ? 'var(--accent)' : 'var(--ink-soft)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
