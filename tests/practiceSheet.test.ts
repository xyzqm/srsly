import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  rowCells, strokeBuildUp, buildRows, labelFor, paginate,
  CELLS_PER_ROW, ROWS_PER_PAGE, GLYPH_BOX, GLYPH_SLACK,
  strokeUnits, LINE_MM, DASH_MM, MIN_PRINTABLE_MM, CELL_MM, STROKE_BOX_MM, GLYPH_VIEWBOX_SIZE,
} from '@/lib/practiceSheet';

/**
 * The printable practice sheet.
 *
 * Two of these are load-bearing and the rest are arithmetic. The GLYPH BOX test reads the real
 * stroke files and asserts nothing is clipped — a claim about the DATA, so a fixture would only
 * test the constant against itself, and the failure it guards is silent: a character prints
 * with a stroke sheared off and looks merely a bit wrong. The FIREWALL test asserts the sheet
 * cannot schedule, which is the whole reason paper practice is allowed to exist at all.
 */

const ROOT = path.join(__dirname, '..');
const STROKES = path.join(ROOT, 'public', 'strokes');

describe('a row is a model, two to trace, then blanks', () => {
  it('composes ten cells', () => {
    const cells = rowCells();
    expect(cells).toHaveLength(CELLS_PER_ROW);
    expect(cells[0]).toBe('model');
    expect(cells[1]).toBe('trace');
    expect(cells[2]).toBe('trace');
    expect(cells.slice(3).every(c => c === 'blank')).toBe(true);
  });

  /** The pure-recall sheet. The characters move to a key at the foot of the page. */
  it('blanks every cell when the models are hidden', () => {
    const cells = rowCells(true);
    expect(cells).toHaveLength(CELLS_PER_ROW);
    expect(cells.every(c => c === 'blank')).toBe(true);
  });
});

describe('the stroke-order band', () => {
  it('builds up cumulatively and ends on the whole character', () => {
    const strokes = ['a', 'b', 'c'];
    expect(strokeBuildUp(strokes)).toEqual([['a'], ['a', 'b'], ['a', 'b', 'c']]);
  });

  it('gives a one-stroke character exactly one box, not zero', () => {
    expect(strokeBuildUp(['a'])).toEqual([['a']]);
    expect(strokeBuildUp([])).toEqual([]);
  });
});

describe('rows are built only for characters we can actually draw', () => {
  const deck = [
    { h: '朋友', p: 'péngyou', m: 'friend; companion' },
    { h: '好朋友', p: 'hǎopéngyou', m: 'good friend' },
    { h: '好', p: 'hǎo', m: 'good; well' },
  ];

  /**
   * A CHARACTER WITH NO STROKE DATA IS DROPPED AND REPORTED, never rendered as an empty box.
   * A blank cell on a worksheet reads as the learner's own omission, and the stroke band
   * would have nothing to show beside it either.
   */
  it('skips a character with no stroke data and names it', () => {
    const { rows, skipped } = buildRows(['朋', '𠀀'], { '朋': ['m1'] }, deck);
    expect(rows.map(r => r.char)).toEqual(['朋']);
    expect(skipped).toEqual(['𠀀']);
  });

  it('treats an empty stroke list as missing rather than as a blank character', () => {
    const { rows, skipped } = buildRows(['好'], { '好': [] }, deck);
    expect(rows).toEqual([]);
    expect(skipped).toEqual(['好']);
  });

  /**
   * The SHORTEST word wins: 朋 is glossed by 朋友 rather than by 好朋友, and 好 by itself
   * rather than by either. A two-character word gives the character a context; a longer one
   * is a phrase to read before the exercise has started.
   */
  it('labels a character from the shortest deck word containing it, lead sense only', () => {
    expect(labelFor(deck, '朋')).toEqual({ pinyin: 'péngyou', meaning: 'friend', index: 1, of: 2 });
    expect(labelFor(deck, '好')).toEqual({ pinyin: 'hǎo', meaning: 'good', index: 1, of: 1 });
  });

  /**
   * A TIE FALLS TO DECK ORDER, and that is the contract rather than an accident — `sort` is
   * stable, so two words of equal length resolve to whichever the learner added first. There
   * is no better answer available: 友 really is in 朋友 and 好友 equally, and picking by any
   * other rule would be inventing a preference the data does not express.
   */
  it('resolves a tie by deck order', () => {
    const tied = [
      { h: '朋友', p: 'péngyou', m: 'friend' },
      { h: '好友', p: 'hǎoyǒu', m: 'close friend' },
    ];
    expect(labelFor(tied, '友').pinyin).toBe('péngyou');
    expect(labelFor([...tied].reverse(), '友').pinyin).toBe('hǎoyǒu');
  });

  /** A character the deck cannot explain still gets a row — the grid is the point. */
  it('does not refuse a character it has no gloss for', () => {
    expect(labelFor(deck, '水')).toEqual({ pinyin: '', meaning: '', index: 0, of: 0 });
    const { rows } = buildRows(['水'], { '水': ['m1'] }, deck);
    expect(rows).toHaveLength(1);
  });
});

describe('pagination', () => {
  const rows = Array.from({ length: 17 }, (_, i) => i);

  it('fills whole pages and leaves the remainder on the last', () => {
    const pages = paginate(rows, 7);
    expect(pages.map(p => p.length)).toEqual([7, 7, 3]);
    expect(pages.flat()).toEqual(rows);
  });

  it('leaves an exact multiple with no trailing empty page', () => {
    expect(paginate([1, 2, 3, 4], 2).map(p => p.length)).toEqual([2, 2]);
  });

  it('produces no pages at all from nothing', () => {
    expect(paginate([], ROWS_PER_PAGE)).toEqual([]);
  });
});

/**
 * THE ONE THAT READS THE REAL DATA.
 *
 * The sheet draws every character with one FIXED viewBox — it has to, or a 一 would swell to
 * fill its cell while a 攤 shrank, and the sheet would teach nothing about relative size. So
 * the box must contain every path in the set, and the number is measured rather than chosen:
 * raw coordinates run x 12..1014 and y -100..888, which after the vertical flip is
 * y 136..1124. The overflow is entirely at the bottom.
 *
 * The bound includes Bézier CONTROL POINTS, which can sit outside the curve they describe —
 * so this over-reserves and can never clip. That is the right direction for the error.
 */
describe('the glyph box holds every character in the set', () => {
  const files = fs.existsSync(STROKES)
    ? fs.readdirSync(STROKES).filter(f => f.endsWith('.json'))
    : [];

  it('has stroke data to check', () => {
    expect(files.length).toBeGreaterThan(2600);
  });

  it('clips nothing, control points included', () => {
    const lo = -GLYPH_SLACK;
    const hi = GLYPH_BOX + GLYPH_SLACK;
    const offenders: string[] = [];

    for (const file of files) {
      const raw = fs.readFileSync(path.join(STROKES, file), 'utf8');
      const data = JSON.parse(raw) as { strokes: string[] };
      for (const d of data.strokes) {
        const nums = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
        for (let i = 0; i + 1 < nums.length; i += 2) {
          const x = nums[i];
          const y = GLYPH_BOX - nums[i + 1];      // the flip, exactly as rendered
          if (x < lo || x > hi || y < lo || y > hi) {
            offenders.push(`${file}: (${nums[i]}, ${nums[i + 1]}) -> (${x}, ${y})`);
            break;
          }
        }
        if (offenders.length > 0) break;
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * A CONTROL, because the test above passes trivially if the slack is enormous. Halving it
   * must FAIL — otherwise it is not measuring the data, it is just a generous number.
   */
  it('is not merely generous — half the slack would clip', () => {
    const lo = -GLYPH_SLACK / 2;
    const hi = GLYPH_BOX + GLYPH_SLACK / 2;
    let clipped = false;
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(STROKES, file), 'utf8')) as { strokes: string[] };
      for (const d of data.strokes) {
        const nums = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
        for (let i = 0; i + 1 < nums.length; i += 2) {
          const y = GLYPH_BOX - nums[i + 1];
          if (nums[i] < lo || nums[i] > hi || y < lo || y > hi) { clipped = true; break; }
        }
        if (clipped) break;
      }
      if (clipped) break;
    }
    expect(clipped).toBe(true);
  });
});

/**
 * THE FIREWALL. Paper practice is allowed to exist precisely BECAUSE it claims nothing.
 *
 * A sheet filled in at a desk is not something the app observed, so it must never write a
 * review — that is the whole argument that replaced the "I was correct" override, and it is
 * one import away from being false at any time.
 */
describe('the sheet grades nothing', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'practiceSheet.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('imports nothing that can schedule, log or persist', () => {
    for (const forbidden of ['fsrs', 'writingState', 'storage', 'activityLog', 'reviewCounts', 'streak']) {
      expect(src).not.toContain(forbidden);
    }
  });

  it('holds no writes of its own', () => {
    for (const forbidden of ['localStorage', 'scheduleWriting', 'logGraded', 'saveWriting']) {
      expect(src).not.toContain(forbidden);
    }
  });
});

/**
 * LINE WEIGHTS, which is where this sheet was actually wrong first time.
 *
 * Every box shares one viewBox, so a stroke-width in units means a different PHYSICAL line
 * depending on the size the box is drawn at. The cross-hairs went out at 5 units — 0.07 mm,
 * a quarter of a screen pixel — and the defining feature of 田字格 paper was simply invisible.
 * Found by looking at it in a browser, which is the only way it could have been found.
 */
describe('ruled lines survive contact with a printer', () => {
  it('round-trips millimetres through the viewBox', () => {
    const units = strokeUnits(0.25, CELL_MM);
    expect(units / GLYPH_VIEWBOX_SIZE * CELL_MM).toBeCloseTo(0.25, 10);
  });

  /** The trap, stated as a test: the same unit count is a different line in a smaller box. */
  it('gives the same unit count a different physical weight in a different box', () => {
    const inCell = 10 / GLYPH_VIEWBOX_SIZE * CELL_MM;
    const inBand = 10 / GLYPH_VIEWBOX_SIZE * STROKE_BOX_MM;
    expect(inCell / inBand).toBeCloseTo(CELL_MM / STROKE_BOX_MM, 10);
    expect(inBand).toBeLessThan(MIN_PRINTABLE_MM);   // which is exactly how it went wrong
  });

  it('keeps every ruled line above the printable floor', () => {
    expect(LINE_MM.cellFrame).toBeGreaterThanOrEqual(MIN_PRINTABLE_MM);
    expect(LINE_MM.cellCross).toBeGreaterThanOrEqual(MIN_PRINTABLE_MM);
    expect(LINE_MM.bandFrame).toBeGreaterThanOrEqual(MIN_PRINTABLE_MM);
  });

  /** A dash shorter than the gap reads as a dotted line, not a guide. */
  it('draws a dash you can see', () => {
    expect(DASH_MM.on).toBeGreaterThan(DASH_MM.off);
    expect(DASH_MM.on).toBeGreaterThan(1);
  });

  /** The frame is heavier than the cross, or the cross reads as the cell edge. */
  it('ranks the frame above the cross-hairs', () => {
    expect(LINE_MM.cellFrame).toBeGreaterThan(LINE_MM.cellCross);
  });
});

/**
 * THE RECALL SHEET'S AMBIGUITY, which only exists once the models are hidden.
 *
 * 朋 and 友 are both labelled from 朋友, so two consecutive rows read "péngyou · friend" and
 * the learner cannot tell which character each is asking for. Visible the moment a sheet is
 * rendered and invisible in the code, which is why it survived until one was looked at.
 */
describe('a recall sheet can tell two characters of one word apart', () => {
  const deck = [{ h: '朋友', p: 'péngyou', m: 'friend' }];

  it('says which character of the word each row wants', () => {
    expect(labelFor(deck, '朋')).toMatchObject({ index: 1, of: 2 });
    expect(labelFor(deck, '友')).toMatchObject({ index: 2, of: 2 });
  });

  it('carries the position onto every row', () => {
    const { rows } = buildRows(['朋', '友'], { '朋': ['a'], '友': ['b'] }, deck);
    expect(rows.map(r => `${r.index}/${r.of}`)).toEqual(['1/2', '2/2']);
    // The labels alone really are identical — which is the whole point.
    expect(new Set(rows.map(r => `${r.pinyin} ${r.meaning}`)).size).toBe(1);
  });

  /** A single-character word has nothing to disambiguate, so the hint stays off. */
  it('says nothing for a one-character word', () => {
    expect(labelFor([{ h: '水', p: 'shuǐ', m: 'water' }], '水')).toMatchObject({ index: 1, of: 1 });
  });
});
