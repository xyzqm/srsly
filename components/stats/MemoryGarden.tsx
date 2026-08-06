'use client';
import { useMemo, useState } from 'react';
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
 */

interface Props { deck: DeckWord[]; }

/** One plant. `g` is 0–1; everything below is derived from it. */
function Stem({ g, w, h }: { g: number; w: number; h: number }) {
  const soil = h - 2;
  if (g <= 0) {
    // Not yet rooted — a seed in bare soil, deliberately distinct from a weak sprout.
    return <circle cx={w / 2} cy={soil - 1.5} r={1.4} fill="var(--ink-faint)" opacity={0.5} />;
  }

  const height = 4 + g * (h - 9);          // stem length grows with the interval
  const top = soil - height;
  // Leaf pairs appear as the plant matures: 1 at a seedling, up to 5 fully grown.
  const pairs = Math.max(1, Math.round(g * 5));
  const spread = 1.6 + g * 3.4;
  // Pale sage → deep green. Hue and lightness both shift so it reads in either theme.
  const colour = `hsl(${120 + g * 26}, ${28 + g * 30}%, ${64 - g * 26}%)`;

  const leaves = [];
  for (let i = 0; i < pairs; i++) {
    const t = (i + 1) / (pairs + 1);
    const y = soil - height * t;
    const s = spread * (1 - t * 0.45);
    leaves.push(
      <g key={i}>
        <path d={`M${w / 2} ${y} q${-s} ${-s * 0.7} ${-s * 1.15} ${s * 0.2}`} stroke={colour} strokeWidth={0.9} fill="none" strokeLinecap="round" />
        <path d={`M${w / 2} ${y} q${s} ${-s * 0.7} ${s * 1.15} ${s * 0.2}`} stroke={colour} strokeWidth={0.9} fill="none" strokeLinecap="round" />
      </g>,
    );
  }

  return (
    <>
      <line x1={w / 2} y1={soil} x2={w / 2} y2={top} stroke={colour} strokeWidth={0.9 + g * 0.7} strokeLinecap="round" />
      {leaves}
      {g > 0.85 && <circle cx={w / 2} cy={top} r={1.5} fill={colour} />}
    </>
  );
}

export default function MemoryGarden({ deck }: Props) {
  const [hover, setHover] = useState<{ word: DeckWord; g: number } | null>(null);

  const plants = useMemo(
    () => deck.filter(isPlanted)
      .map(w => ({ word: w, g: growthOf(w) }))
      .sort((a, b) => a.g - b.g),
    [deck],
  );
  const summary = useMemo(() => gardenSummary(deck), [deck]);

  if (plants.length === 0) return null;

  // Cell width shrinks as the deck grows so a big collection stays on one screen.
  const cw = plants.length > 600 ? 7 : plants.length > 250 ? 10 : 14;
  const ch = 46;
  const perRow = Math.max(12, Math.floor(760 / cw));
  const rows = Math.ceil(plants.length / perRow);

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
          viewBox={`0 0 ${perRow * cw} ${rows * ch}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label={`${summary.planted} words drawn as plants; ${summary.rooted} have taken root`}
        >
          {plants.map((p, i) => {
            const x = (i % perRow) * cw;
            const y = Math.floor(i / perRow) * ch;
            return (
              <g
                key={p.word.id ?? p.word.h + i}
                transform={`translate(${x} ${y})`}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'default' }}
              >
                <rect width={cw} height={ch} fill="transparent" />
                <line x1={1} y1={ch - 2} x2={cw - 1} y2={ch - 2} stroke="var(--line)" strokeWidth={0.6} />
                <Stem g={p.g} w={cw} h={ch} />
              </g>
            );
          })}
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
