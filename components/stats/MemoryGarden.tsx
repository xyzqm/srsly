'use client';
import { useMemo, useRef, useState } from 'react';
import type { DeckWord } from '@/lib/types';
import { growthOf, growthLabel, isPlanted, gardenSummary } from '@/lib/growth';

/**
 * The deck drawn as a field of plants, one per word, height and fullness set by how
 * well-rooted that word is (lib/growth.ts).
 *
 * Every stem is drawn from a continuous 0–1 value rather than snapped to a stage, so a
 * card moving from a 30-day to a 60-day interval visibly gains height. Discrete stages
 * would have made most reviews look like they did nothing.
 *
 * Sorted shortest-to-tallest rather than left in deck order: an unsorted field reads as
 * noise, while a rising slope shows the shape of the whole collection at a glance — how
 * much is still bare, where the bulk sits, how far the best have got.
 *
 * SCALING TO A FULL CURRICULUM (~3,000 words)
 * One plant per word is kept — aggregating into bins would throw away the one thing the
 * picture is for, which is seeing your own collection rather than a histogram of it. What
 * changes with deck size is how much of each plant is drawn, because past a certain density
 * the detail is not resolvable anyway. Measured on real DOM at 3,000 words:
 *
 *              nodes   mount   relayout
 *   full        29103  71 ms    4.2 ms
 *   this file    6355  16 ms    0.8 ms
 *
 * Three things get it there and none of them costs a visible pixel:
 *   1. Leaves are drawn only while a cell is wide enough to show them (`TIERS.leaves`).
 *      They were 58% of all nodes and, at a 6.5px cell, sub-pixel.
 *   2. One soil line per ROW, not one per plant.
 *   3. Hover is delegated to the <svg> and the index derived from the grid, instead of two
 *      handler props and a transparent hit <rect> on all 3,000 groups.
 * The field is also memoised away from `hover`, so moving the mouse re-renders one caption
 * line rather than the entire garden — which was the larger cost of the two.
 *
 * Canvas was the alternative and is not worth it here: it would forfeit CSS-variable
 * theming, the accessible label, and crispness at any zoom, to beat 16 ms.
 */

interface Props { deck: DeckWord[]; }

/** Cell geometry by deck size. Height shrinks with width so a big deck stays a field
 *  rather than a forest of spikes — 3,000 words at the old 46px row was 1,200px tall. */
const TIERS = [
  { max: 250,       cw: 14, ch: 46, leaves: true  },
  { max: 600,       cw: 10, ch: 38, leaves: true  },
  { max: 1500,      cw: 7,  ch: 28, leaves: false },
  { max: Infinity,  cw: 5,  ch: 22, leaves: false },
];

const FIELD_W = 760;

/** One plant. `g` is 0–1; everything below is derived from it. */
function Stem({ g, w, h, leaves }: { g: number; w: number; h: number; leaves: boolean }) {
  const soil = h - 2;
  if (g <= 0) {
    // Not yet rooted — a seed in bare soil, deliberately distinct from a weak sprout.
    return <circle cx={w / 2} cy={soil - 1.5} r={1.2} fill="var(--ink-faint)" opacity={0.5} />;
  }

  const height = 3 + g * (h - 7);          // stem length grows with the interval
  const top = soil - height;
  const spread = 1.6 + g * 3.4;
  // Pale sage → deep green. Hue and lightness both shift so it reads in either theme.
  const colour = `hsl(${120 + g * 26}, ${28 + g * 30}%, ${64 - g * 26}%)`;

  const foliage = [];
  if (leaves) {
    // Leaf pairs appear as the plant matures: 1 at a seedling, up to 5 fully grown.
    const pairs = Math.max(1, Math.round(g * 5));
    for (let i = 0; i < pairs; i++) {
      const t = (i + 1) / (pairs + 1);
      const y = soil - height * t;
      const s = spread * (1 - t * 0.45);
      foliage.push(
        <path key={i} d={`M${w / 2 - s * 1.15} ${y + s * 0.2} q${s * 0.15} ${-s * 0.9} ${s * 1.15} ${-s * 0.2} q${s} ${-s * 0.7} ${s * 1.15} ${s * 0.2}`}
          stroke={colour} strokeWidth={0.85} fill="none" strokeLinecap="round" />,
      );
    }
  }

  return (
    <>
      <line x1={w / 2} y1={soil} x2={w / 2} y2={top} stroke={colour} strokeWidth={0.9 + g * 0.7} strokeLinecap="round" />
      {foliage}
      {g > 0.85 && <circle cx={w / 2} cy={top} r={1.4} fill={colour} />}
    </>
  );
}

export default function MemoryGarden({ deck }: Props) {
  const [hover, setHover] = useState<{ word: DeckWord; g: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const plants = useMemo(
    () => deck.filter(isPlanted)
      .map(w => ({ word: w, g: growthOf(w) }))
      .sort((a, b) => a.g - b.g),
    [deck],
  );
  const summary = useMemo(() => gardenSummary(deck), [deck]);

  const tier = TIERS.find(t => plants.length <= t.max)!;
  const { cw, ch, leaves } = tier;
  const perRow = Math.max(12, Math.floor(FIELD_W / cw));
  const rows = Math.max(1, Math.ceil(plants.length / perRow));

  // The field is memoised on the plants alone — deliberately NOT on `hover`. Rebuilding
  // thousands of elements to highlight nothing was the single biggest cost of a mouse move.
  const field = useMemo(() => (
    <>
      {Array.from({ length: rows }, (_, r) => (
        // The last row is usually part-filled, so its soil stops under the last plant
        // rather than running on into empty ground.
        <line key={`s${r}`} x1={0} y1={r * ch + ch - 1.5} y2={r * ch + ch - 1.5}
          x2={Math.min(perRow, plants.length - r * perRow) * cw}
          stroke="var(--line)" strokeWidth={0.6} />
      ))}
      {plants.map((p, i) => (
        <g key={p.word.id ?? p.word.h + i} transform={`translate(${(i % perRow) * cw} ${Math.floor(i / perRow) * ch})`}>
          <Stem g={p.g} w={cw} h={ch} leaves={leaves} />
        </g>
      ))}
    </>
  ), [plants, rows, perRow, cw, ch, leaves]);


  if (plants.length === 0) return null;

  /** Which plant is under the pointer, from the grid — no per-plant hit target needed. */
  const pick = (clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const scale = (perRow * cw) / r.width;                       // viewBox units per CSS px
    const col = Math.floor(((clientX - r.left) * scale) / cw);
    const row = Math.floor(((clientY - r.top) * scale) / ch);
    if (col < 0 || col >= perRow || row < 0) return null;
    const i = row * perRow + col;
    return i >= 0 && i < plants.length ? plants[i] : null;
  };

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Memory garden
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
          {summary.rooted} rooted · {summary.planted - summary.rooted} not yet · strongest {Math.round(summary.strongest)}d
        </div>
      </div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '6px 0 12px', maxWidth: '52ch', lineHeight: 1.5 }}>
        One plant per word. Height is how long you could go without review and still
        remember it — so the field grows only when your memory does.
      </p>

      <div
        className="rounded-[11px] overflow-hidden"
        style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', padding: '10px 12px' }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${perRow * cw} ${rows * ch}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label={`${summary.planted} words drawn as plants; ${summary.rooted} have taken root`}
          onMouseMove={e => {
            const p = pick(e.clientX, e.clientY);
            // Compare by identity so tracking across a plant's own area is a no-op re-render.
            setHover(cur => (cur?.word === p?.word ? cur : p));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {field}
        </svg>
      </div>

      <div style={{ minHeight: 20, marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
        {hover ? (
          <>
            <strong style={{ fontFamily: 'var(--f-han)', fontSize: 14, color: 'var(--ink)' }}>{hover.word.h}</strong>
            {' — '}{growthLabel(hover.g)}
            {hover.word.stability ? ` · holds ${Math.round(hover.word.stability)} day${Math.round(hover.word.stability) === 1 ? '' : 's'}` : ''}
          </>
        ) : (
          <span style={{ color: 'var(--ink-faint)' }}>Hover a plant to see its word.</span>
        )}
      </div>
    </div>
  );
}
