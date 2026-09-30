'use client';
import { useEffect, useState } from 'react';
import type { DeckWord, LanguageCode, ShelfEntry } from '@/lib/types';
import { storage } from '@/lib/storage';
import { MAX_ENTRIES } from '@/lib/shelf';
import { getLanguageConfig } from '@/lib/languageConfig';
import { yearInReading, type YearInReading as Summary } from '@/lib/yearInReading';

/**
 * What the year looked like — every number derived on read, nothing stored.
 *
 * The arithmetic lives in `lib/yearInReading.ts`, which is a pure function and is where the
 * reasoning is written down, including the list of things this page deliberately cannot say.
 * This file is the drawing.
 *
 * **IT RENDERS NOTHING RATHER THAN RENDERING ZEROS**, in two different cases that must not be
 * collapsed: `data === null` is "not loaded yet" and `sparse` is "there is genuinely too little
 * to look back on". Either way the panel is ABSENT — a retrospective of nothing is the sharpest
 * possible version of the wall of empty progress bars that `npm run seed:dev` exists because of.
 *
 * **NO CHART LIBRARY**, the same judgement as `lib/fsrs.ts` and the absent `openai` SDK: one
 * single-series column chart is a `<path>` per month, and it has to inherit ten themes from CSS
 * variables, which is precisely what a charting library's own palette would fight.
 */

const SUPPORTED: LanguageCode[] = ['zh', 'ja', 'es', 'fr'];
const mono = { fontFamily: 'var(--f-mono)' } as const;

const label: React.CSSProperties = {
  ...mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)',
};

/* ── The column chart ──────────────────────────────────────────────────────────
   One series, so there is no legend: the heading names it. Magnitude is HEIGHT, so
   every column is the same hue rather than a colour ramp — a ramp here would encode
   the same fact twice and then disagree with itself at the rounding. The data-end is
   rounded and the baseline end is square, because the bar is anchored to the axis;
   a `rect` with `rx` rounds the anchored end too and lifts the bar off its own line. */
const CHART_H = 96;
const SLOT = 34;
const BAR = 24;          // leaves a 10px surface gap, comfortably past the 2px minimum
const RADIUS = 4;

/** A column with its top corners rounded and its foot square. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, h, w / 2);
  const bottom = y + h;
  return `M${x} ${bottom} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${bottom} Z`;
}

const MONTH_INITIAL = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function MonthChart({ months }: { months: Summary['months'] }) {
  const max = Math.max(1, ...months.map(m => m.cards));
  /**
   * THE LABEL GOES ON THE TALLEST COLUMN IN THIS CHART, which is not the same month as the
   * busiest DAY — and the first version used the latter. Caught by rendering it and looking:
   * the number sat on a visibly shorter bar with taller unlabelled ones beside it, which reads
   * as a mislabelled chart rather than as two different facts. A direct label has to name the
   * extreme of the series it is drawn on; the busiest single day is a separate statistic and
   * is reported as one, next to the total it belongs to.
   */
  const peak = months.reduce((best, m) => (m.cards > best.cards ? m : best), months[0]);
  const w = months.length * SLOT;
  return (
    <svg
      viewBox={`0 0 ${w} ${CHART_H + 26}`}
      width="100%"
      height={CHART_H + 26}
      role="img"
      aria-label={`Cards graded each month: ${months.map(m => `${m.month} ${m.cards}`).join(', ')}`}
      style={{ maxWidth: w, display: 'block', marginTop: 10 }}
    >
      {months.map((m, i) => {
        const h = m.cards === 0 ? 0 : Math.max(3, Math.round((m.cards / max) * (CHART_H - 16)));
        const x = i * SLOT + (SLOT - BAR) / 2;
        const y = CHART_H - h;
        const monthNo = Number(m.month.slice(5, 7));
        return (
          <g key={m.month}>
            {/* An empty month draws a faint foot rather than nothing: a gap the reader can see
                is the finding, and a month simply missing from the row hides it. */}
            {h === 0
              ? <rect x={x} y={CHART_H - 2} width={BAR} height={2} fill="var(--line-soft)" />
              : <path d={columnPath(x, y, BAR, h)} fill="var(--accent)" />}
            <title>{`${m.month} · ${m.cards.toLocaleString()} card${m.cards === 1 ? '' : 's'}${m.passages ? ` · ${m.passages} passage${m.passages === 1 ? '' : 's'}` : ''}`}</title>
            <text
              x={i * SLOT + SLOT / 2} y={CHART_H + 14} textAnchor="middle"
              style={{ ...mono, fontSize: 9.5, fill: 'var(--ink-faint)' }}
            >
              {MONTH_INITIAL[monthNo - 1]}
            </text>
            {/* SELECTIVE direct labels: the busiest month only. A number over every column is
                a table drawn badly, and it is the first thing that collides at this width. */}
            {m.month === peak?.month && m.cards > 0 && (
              <text
                x={i * SLOT + SLOT / 2} y={y - 5} textAnchor="middle"
                style={{ ...mono, fontSize: 9.5, fill: 'var(--ink-soft)' }}
              >
                {m.cards.toLocaleString()}
              </text>
            )}
          </g>
        );
      })}
      <line x1={0} y1={CHART_H} x2={w} y2={CHART_H} stroke="var(--line)" strokeWidth={1} />
    </svg>
  );
}

function Stat({ n, unit, note }: { n: number | string; unit: string; note?: string }) {
  return (
    <div style={{ minWidth: 96 }}>
      <div style={{ ...mono, fontSize: 22, color: 'var(--ink)', lineHeight: 1.1 }}>
        {typeof n === 'number' ? n.toLocaleString() : n}
      </div>
      <div style={{ ...mono, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 4 }}>
        {unit}
      </div>
      {note && <div style={{ ...mono, fontSize: 9.5, color: 'var(--ink-faint)', opacity: 0.85, marginTop: 3 }}>{note}</div>}
    </div>
  );
}

export default function YearInReading() {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      // Fired together on purpose: `row()` coalesces concurrent reads into one request, which
      // is the property `tests/rowCoalescing.test.ts` pins. Awaiting these in sequence would be
      // nine round trips to fetch one row nine times.
      const [log, lessonsDone, ...rest] = await Promise.all([
        storage.getActivityLog(),
        storage.getLessonsDone(),
        ...SUPPORTED.map(l => storage.getShelf(l)),
        ...SUPPORTED.map(l => storage.getVocabDeck(l)),
      ]);
      if (!live) return;
      const shelves: Partial<Record<LanguageCode, ShelfEntry[]>> = {};
      const decks: Partial<Record<LanguageCode, DeckWord[]>> = {};
      SUPPORTED.forEach((l, i) => {
        shelves[l] = rest[i] as ShelfEntry[];
        decks[l] = rest[SUPPORTED.length + i] as DeckWord[];
      });
      setData(yearInReading({ log, shelves, decks, srs: null, lessonsDone, shelfCap: MAX_ENTRIES }));
    })();
    return () => { live = false; };
  }, []);

  // Absent, never zeroed — and `null` (not loaded) and `sparse` (nothing to say) are two
  // different reasons for the same silence, which is why they are two separate tests.
  if (data === null || data.sparse) return null;

  const since = data.firstRecorded
    ? new Date(data.firstRecorded + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="rounded-[11px] px-5 py-5 mt-8" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div style={label}>Your reading so far</div>
        {/* THE RECORD'S OWN START DATE, for the reason ReviewHeatmap's legend gives: the log
            keeps 400 days and kept 120 until 2026-09-29, so a page calling itself a year before
            a year has been recorded would be claiming data that was deleted. */}
        {since && <div style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)' }}>recorded since {since}</div>}
      </div>

      <div className="flex flex-wrap gap-x-9 gap-y-5" style={{ marginTop: 16 }}>
        <Stat n={data.daysStudied} unit="days studied" />
        <Stat
          n={data.cardsGraded}
          unit="cards graded"
          note={data.busiest ? `${data.busiest.n.toLocaleString()} on the busiest day` : undefined}
        />
        <Stat n={data.longestRun} unit="day best run" note="anywhere, not just now" />
        {data.wordsRead > 0 && <Stat n={data.wordsRead} unit="words read" note={`${data.passages} passage${data.passages === 1 ? '' : 's'}`} />}
        <Stat n={data.wordsMastered} unit="words holding" note={`of ${data.wordsHeld.toLocaleString()} collected`} />
        {data.lessonsFinished > 0 && <Stat n={data.lessonsFinished} unit="lessons read" />}
      </div>

      <div style={{ ...label, marginTop: 22 }}>Cards graded by month</div>
      <MonthChart months={data.months} />

      {data.byLanguage.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={label}>What you read</div>
          <div className="flex flex-col gap-1" style={{ marginTop: 8 }}>
            {data.byLanguage.map(l => (
              <div key={l.language} className="flex items-baseline justify-between gap-4" style={{ ...mono, fontSize: 12, color: 'var(--ink-soft)', maxWidth: '34rem' }}>
                <span>{getLanguageConfig(l.language).name}</span>
                <span style={{ color: 'var(--ink-faint)' }}>
                  {l.passages} passage{l.passages === 1 ? '' : 's'} · {l.wordsRead.toLocaleString()} words
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Said out loud rather than quietly undercounted. The shelf drops its oldest entries at
          MAX_ENTRIES per language, so a heavy reader's early months are genuinely gone. */}
      {data.shelfMayBeClipped.length > 0 && (
        <p style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '14px 0 0', maxWidth: '52ch' }}>
          The passage shelf keeps the most recent {MAX_ENTRIES} per language, so the earliest{' '}
          {data.shelfMayBeClipped.map(l => getLanguageConfig(l).name).join(' and ')} reading is no
          longer counted here.
        </p>
      )}
    </div>
  );
}
