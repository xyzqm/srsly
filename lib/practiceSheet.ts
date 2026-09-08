import type { DeckWord } from './types';

/**
 * The printable handwriting sheet — 田字格 practice paper, generated from the deck.
 *
 * ── PAPER DOES THE PRACTICE; THE SCREEN DOES THE MEASUREMENT ──
 * This module grades NOTHING. No FSRS write, no schedule, no streak, no activity log — the
 * same posture the removed cram mode had, and for the same reason: a sheet you filled in at
 * a desk is not something the app watched you do, so it must not pretend to have evidence.
 * `WritingCanvas` is where a stroke is actually observed and where a grade is therefore
 * honest. `tests/practiceSheet.test.ts` pins the separation by asserting this module imports
 * nothing that can schedule.
 *
 * That is also the answer to the "I practised on paper, mark me correct" request this
 * replaced. A self-grade button next to a stroke-verified one writes a review the schedule
 * can never tell apart from a real one afterwards. Giving paper its own surface — which
 * claims nothing — costs no accuracy and serves the actual need better.
 *
 * ── PURE, BECAUSE THE GEOMETRY IS THE PART WORTH TESTING ──
 * Cell composition, pagination and the glyph box are decided here; `PracticeSheet.tsx` only
 * draws. Tests cover `lib/` and not components, so anything that can be got wrong silently —
 * a character clipped at the edge of its box, a row split across a page break — has to live
 * on this side of the line.
 */

/* ─────────────────────────── physical geometry ─────────────────────────── */

/**
 * MILLIMETRES, NOT PIXELS, BECAUSE THE SHEET IS A PHYSICAL OBJECT.
 *
 * A cell has to be 18 mm on the paper in the tray, whichever paper that is. Sizing in px and
 * hoping the print scale works out is how practice grids come out at 14 mm on A4 and 19 mm on
 * Letter — and a 田字格 that is not roughly finger-sized is not practice paper.
 *
 * The column count is set by the NARROWER of the two papers this will meet. A4 is 210 mm and
 * US Letter 216 mm; at a 12 mm margin that leaves 186 mm on A4, so ten 18 mm cells (180 mm)
 * fit both. The row count is set by the SHORTER one: Letter is 279 mm to A4's 297 mm, leaving
 * about 255 mm, and a row band is ~34 mm.
 */
export const CELL_MM = 18;
export const CELLS_PER_ROW = 10;
export const STROKE_BOX_MM = 6;
export const PAGE_MARGIN_MM = 12;
export const ROWS_PER_PAGE = 7;

/* ──────────────────────────── the glyph box ────────────────────────────── */

/** The coordinate space every file in `public/strokes/` is drawn in. */
export const GLYPH_BOX = 1024;

/**
 * Y POINTS UP IN THE DATA AND DOWN IN SVG, so every character needs a vertical flip.
 *
 * `hanzi-writer` does this with `translate(xOffset, height - yOffset) scale(scale, -scale)`.
 * With no offset and no scaling that reduces to the transform below. Get it wrong and every
 * character prints upside down — which is at least loud. Get the SLACK wrong and a handful of
 * characters print with a stroke silently sheared off, which is not.
 */
export const GLYPH_TRANSFORM = `translate(0, ${GLYPH_BOX}) scale(1, -1)`;

/**
 * How far outside the nominal 1024 box the paths actually reach — MEASURED, not guessed.
 *
 * Across all 2,663 stroke files the raw coordinates run x 12..1014 and y -100..888. After the
 * flip that is x 12..1014 and y 136..1124 — so the overflow is entirely at the BOTTOM, by 100
 * units, and there is none at the top or the sides. An earlier guess of "about 50 units all
 * round" was wrong in both size and direction.
 *
 * The bound is deliberately CONSERVATIVE: it includes quadratic Bézier control points, which
 * can lie outside the curve they describe, so the real ink extends less far than 1124. That
 * is the right way round for choosing a viewBox — it can only over-reserve, never clip.
 *
 * The slack is applied symmetrically so the nominal glyph box stays centred in the cell. The
 * side effect is that a character draws at about 82% of the cell, which is roughly where a
 * character sits on real practice paper anyway.
 */
export const GLYPH_SLACK = 110;

export const GLYPH_VIEWBOX_SIZE = GLYPH_BOX + 2 * GLYPH_SLACK;

export const GLYPH_VIEWBOX =
  `${-GLYPH_SLACK} ${-GLYPH_SLACK} ${GLYPH_VIEWBOX_SIZE} ${GLYPH_VIEWBOX_SIZE}`;

/* ─────────────────────────── line weights ──────────────────────────────── */

/**
 * RULED LINES ARE SPECIFIED IN MILLIMETRES AND CONVERTED, NEVER WRITTEN AS viewBox UNITS.
 *
 * Every box on this sheet — an 18 mm cell, a 6 mm stroke box — uses the SAME viewBox, because
 * they all draw the same 1024-unit glyph space. So a stroke-width of 10 units is 0.14 mm in a
 * cell and 0.05 mm in a stroke box: the same number means a different physical line depending
 * on how big the box is drawn. That is not a rounding detail. The first version of this sheet
 * had the 田字格 cross-hairs at 5 units, which is 0.07 mm — a quarter of a screen pixel — so
 * the defining feature of 田字格 paper was invisible, and it looked like plain squares.
 *
 * Hence: state the weight a PRINTER should lay down, and let `strokeUnits` do the arithmetic
 * against the box it is being drawn in. `MIN_PRINTABLE_MM` is the floor a consumer laser or
 * inkjet reliably renders as a continuous line rather than a dotted ghost.
 */
export const MIN_PRINTABLE_MM = 0.15;

export const LINE_MM = {
  /** The 田字格 border. */
  cellFrame: 0.35,
  /** The dashed cross that makes it a 田字格 rather than a box. */
  cellCross: 0.25,
  /** The stroke-order boxes, lighter because they are a reference and not a writing space. */
  bandFrame: 0.20,
} as const;

/** Dash pattern for the cross-hairs, also in millimetres. */
export const DASH_MM = { on: 1.6, off: 1.1 } as const;

/** A physical line weight, in the viewBox units of a box drawn `boxMm` millimetres wide. */
export function strokeUnits(mm: number, boxMm: number): number {
  return (mm / boxMm) * GLYPH_VIEWBOX_SIZE;
}

/* ────────────────────────────── the row ────────────────────────────────── */

export type CellKind = 'model' | 'trace' | 'blank';

/**
 * What the ten cells of a row hold.
 *
 * Model, two to trace over, then empty. The learner who wants RECALL rather than copying
 * covers the left of the row with a hand — which is why the model sits at the start rather
 * than being a separate sheet. `hideModels` turns the whole row blank for a pure recall
 * sheet, and the characters are printed as a key at the foot of the page instead, because a
 * recall exercise you cannot mark yourself against is a worksheet with no answers.
 */
export function rowCells(hideModels = false): CellKind[] {
  if (hideModels) return Array<CellKind>(CELLS_PER_ROW).fill('blank');
  return Array.from({ length: CELLS_PER_ROW }, (_, i) =>
    i === 0 ? 'model' : i <= 2 ? 'trace' : 'blank');
}

/**
 * The stroke-order band: stroke 1, strokes 1–2, strokes 1–3, … the whole character.
 *
 * This is the one thing on the sheet a FONT could not produce, and the reason the characters
 * are drawn from stroke paths rather than set as text in `--f-han`. It is how a Chinese
 * practice book teaches order, and it costs nothing — the cumulative slices are already in
 * the file the writing quiz downloads.
 *
 * It gets its own 6 mm band rather than eating cells from the row. Measured across the whole
 * set, stroke counts run to a median of 9 and a maximum of 23, so an inline build-up would
 * have consumed two full rows for the worst characters. At 6 mm, even 23 boxes is 138 mm and
 * fits the 186 mm of usable width.
 */
export function strokeBuildUp(strokes: readonly string[]): string[][] {
  return strokes.map((_, i) => strokes.slice(0, i + 1));
}

export interface SheetRow {
  char: string;
  /** Reading and gloss, taken from a deck word this character appears in. May be empty. */
  pinyin: string;
  meaning: string;
  /**
   * WHICH character of that word this is, 1-based, and how many the word has.
   *
   * Only interesting with the models hidden, and then it is essential rather than a nicety.
   * 朋 and 友 both take their label from 朋友, so a recall sheet printed two consecutive rows
   * reading "péngyou · friend" with no way to tell which character each was asking for. The
   * on-screen prompt already solves this the same way ("the first character of 2"); the sheet
   * was simply missing it. Found by looking at a rendered sheet, not by reading the code.
   */
  index: number;
  of: number;
  /** SVG path `d` strings, in stroke order. */
  strokes: string[];
}

/**
 * The reading and meaning to print beside a character.
 *
 * The SHORTEST deck word containing it, matching `WritingPrompt` on screen: a two-character
 * word gives the character a context, a six-character one is a sentence to read before the
 * exercise starts. Only the lead sense is taken — a full five-sense gloss would not fit the
 * gutter and is the same judgement `GlossText` makes everywhere else.
 */
export function labelFor(
  deck: readonly Pick<DeckWord, 'h' | 'p' | 'm'>[],
  char: string,
): { pinyin: string; meaning: string; index: number; of: number } {
  const word = deck
    .filter(w => w.h.includes(char))
    .sort((a, b) => a.h.length - b.h.length)[0];
  return {
    pinyin: word?.p ?? '',
    meaning: word?.m?.split(/\s*[;,]\s*/)[0] ?? '',
    // 1-based position of this character within that word, and the word's length. Zero when
    // no deck word contains it, which the renderer reads as "nothing to say".
    index: word ? word.h.indexOf(char) + 1 : 0,
    of: word ? word.h.length : 0,
  };
}

/**
 * Turn characters plus their stroke data into printable rows.
 *
 * A character with NO stroke data is dropped and REPORTED rather than rendered as an empty
 * box. Silence would put a character on the sheet that the model cell cannot draw and the
 * stroke band cannot explain — a blank the learner would read as their own mistake. The set
 * with data is exactly the set the writing quiz covers, so the sheet and the screen never
 * disagree about which characters exist.
 */
export function buildRows(
  chars: readonly string[],
  strokeData: Readonly<Record<string, string[]>>,
  deck: readonly Pick<DeckWord, 'h' | 'p' | 'm'>[],
): { rows: SheetRow[]; skipped: string[] } {
  const rows: SheetRow[] = [];
  const skipped: string[] = [];
  for (const char of chars) {
    const strokes = strokeData[char];
    if (!strokes || strokes.length === 0) { skipped.push(char); continue; }
    rows.push({ char, strokes, ...labelFor(deck, char) });
  }
  return { rows, skipped };
}

/**
 * Cut the rows into pages.
 *
 * Done here rather than left to `break-inside: avoid` alone. The CSS rule is still applied —
 * it is the backstop when a browser disagrees about millimetres — but an explicit page means
 * the sheet knows how many sheets of paper it is, which is what the header can then say.
 */
export function paginate<T>(rows: readonly T[], perPage = ROWS_PER_PAGE): T[][] {
  if (perPage < 1) return rows.length > 0 ? [[...rows]] : [];
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  return pages;
}
