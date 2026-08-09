'use client';
import { useMemo, useRef, useState } from 'react';
import type { DeckWord, LanguageCode } from '@/lib/types';
import { getLanguageConfig } from '@/lib/languageConfig';

/**
 * The deck as a solar system: one dot per word, orbiting further out the longer you can
 * go without seeing it again.
 *
 * Distance from the centre is FSRS `stability` — the number of days until recall decays to
 * ~90%. It is the one figure in the app that cannot be farmed: it only rises when you
 * remember something later than you did last time. So an outer ring is earned, and the
 * picture as a whole says "here is how much of this language I actually hold", which a
 * count of cards never does.
 *
 * PER LANGUAGE, NEVER COMBINED. `deck` arrives already scoped by useVocabDeck(language);
 * pooling four languages' retention into one figure would describe nobody's study.
 *
 * POSITIONS ARE DERIVED FROM THE WORD, NOT FROM Math.random()
 * A random angle picked at render time re-rolls on every state change, so the whole system
 * would jump each time the pointer moved between dots. Angle and radial jitter are hashed
 * from the word itself: stable across renders, stable across sessions, and still visually
 * unstructured. It also means a word keeps its place as the deck grows around it.
 */

interface Props { deck: DeckWord[]; language: LanguageCode; }

/** Outer bound of each ring, in days of stability. The last ring is everything beyond. */
const RINGS = [
  { max: 7,        label: '< 1 week',  radius: 62 },
  { max: 30,       label: '< 1 month', radius: 104 },
  { max: 90,       label: '< 3 months', radius: 144 },
  { max: Infinity, label: '3 months +', radius: 182 },
];

const SIZE = 400;
const C = SIZE / 2;

/**
 * One hue, four strengths — pale near the centre, saturated at the rim.
 *
 * This was a red → amber → green ramp, which is an alert scale: it says the inner ring is a
 * problem. It isn't. A word one day old is not failing, it is new, and the only thing the
 * distance means is how long it will hold. Encoding that in saturation of a single colour
 * says exactly that much and nothing more, and it stays legible for the ~8% of men with
 * red–green colour blindness, for whom the old ramp collapsed at both ends.
 *
 * Built from theme variables so it follows all six themes rather than fixing a palette.
 */
const RING_COLOR = [
  'color-mix(in srgb, var(--jade) 22%, var(--ink-faint))',
  'color-mix(in srgb, var(--jade) 55%, var(--ink-faint))',
  'color-mix(in srgb, var(--jade) 82%, var(--ink-soft))',
  'var(--jade)',
];

/** The ring outline, tinted with its own dots so each band reads as a unit. */
const RING_STROKE = [
  'color-mix(in srgb, var(--jade) 16%, var(--line))',
  'color-mix(in srgb, var(--jade) 28%, var(--line))',
  'color-mix(in srgb, var(--jade) 40%, var(--line))',
  'color-mix(in srgb, var(--jade) 55%, var(--line))',
];

/** FNV-1a. Cheap, well-spread, and identical every run — which is the whole requirement. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

interface Dot { word: DeckWord; ring: number; x: number; y: number; stability: number }

export default function Orbit({ deck, language }: Props) {
  const [hover, setHover] = useState<Dot | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cfg = getLanguageConfig(language);

  const { dots, unlaunched } = useMemo(() => {
    const out: Dot[] = [];
    let notYet = 0;
    for (const w of deck) {
      if (w.pool) continue;                       // staged, not yet in circulation
      const s = w.stability ?? 0;
      if (s <= 0) { notYet++; continue; }         // never graduated a review — still at the core
      const ring = RINGS.findIndex(r => s < r.max);
      const seed = hash((w.id ?? w.h) + '|' + w.h);
      const angle = (seed / 0x100000000) * Math.PI * 2;
      // A second, decorrelated draw for the radial jitter, so dots band loosely around the
      // ring instead of sitting on a perfect circle.
      const jitter = ((hash(String(seed)) / 0x100000000) - 0.5) * 26;
      const r = RINGS[ring].radius + jitter;
      out.push({ word: w, ring, stability: s, x: C + r * Math.cos(angle), y: C + r * Math.sin(angle) });
    }
    return { dots: out, unlaunched: notYet };
  }, [deck]);

  if (dots.length === 0 && unlaunched === 0) return null;

  // Dots shrink as the system fills, so a full curriculum stays legible.
  const dotR = dots.length > 1200 ? 1.9 : dots.length > 400 ? 2.6 : 3.4;
  const perRing = RINGS.map((_, i) => dots.filter(d => d.ring === i).length);

  /** Nearest dot to the pointer, within a forgiving radius — the dots are too small to hit
   *  directly, and a transparent hit target per dot would double the node count. */
  const pick = (clientX: number, clientY: number): Dot | null => {
    const el = svgRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const scale = SIZE / box.width;
    const px = (clientX - box.left) * scale, py = (clientY - box.top) * scale;
    let best: Dot | null = null, bestD = (dotR + 6) ** 2;
    for (const d of dots) {
      const dist = (d.x - px) ** 2 + (d.y - py) ** 2;
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return best;
  };

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="font-[family-name:var(--f-mono)] text-[11px] tracking-[.2em] uppercase" style={{ color: 'var(--ink-faint)' }}>
          Orbit
        </div>
        <div className="font-[family-name:var(--f-mono)] text-[11px]" style={{ color: 'var(--ink-faint)' }}>
          {dots.length.toLocaleString()} in orbit
          {unlaunched > 0 && <> · {unlaunched.toLocaleString()} not yet</>}
        </div>
      </div>
      <p className="text-[13.5px] leading-normal max-w-[52ch] mt-1.5 mb-3" style={{ color: 'var(--ink-soft)' }}>
        One dot per word, orbiting further out the longer you could go without review and
        still remember it. Words only move outward by being recalled late.
      </p>

      <div className="flex flex-wrap items-start gap-6">
        <div
          className="rounded-[11px] shrink-0"
          style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', padding: 8 }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="block w-[min(400px,68vw)] h-auto"
            role="img"
            aria-label={`${dots.length} words placed in four orbits by how long they will hold: ${RINGS.map((r, i) => `${perRing[i]} ${r.label}`).join(', ')}`}
            onMouseMove={e => {
              const d = pick(e.clientX, e.clientY);
              setHover(cur => (cur?.word === d?.word ? cur : d));
            }}
            onMouseLeave={() => setHover(null)}
          >
            {RINGS.map((r, i) => (
              <circle key={i} cx={C} cy={C} r={r.radius} fill="none"
                stroke={RING_STROKE[i]} strokeWidth={i === RINGS.length - 1 ? 1.3 : 1}
                strokeDasharray={i === RINGS.length - 1 ? undefined : '2 5'} />
            ))}

            {/* The core: words that have never held a review yet. Distinct from a weak
                orbit — "not started" and "started badly" are different facts. */}
            <circle cx={C} cy={C} r={22} fill="var(--card)" stroke="var(--line)" strokeWidth={1} />
            <text x={C} y={C - 2} textAnchor="middle"
              className="font-[family-name:var(--f-mono)]" fontSize={13} fill="var(--ink)">
              {unlaunched}
            </text>
            <text x={C} y={C + 10} textAnchor="middle"
              className="font-[family-name:var(--f-mono)]" fontSize={6.5} fill="var(--ink-faint)"
              letterSpacing="0.08em">
              NOT YET
            </text>

            {dots.map((d, i) => (
              <circle key={d.word.id ?? d.word.h + i} cx={d.x} cy={d.y} r={dotR + d.ring * 0.35}
                fill={RING_COLOR[d.ring]}
                opacity={hover && hover !== d ? 0.35 : 1}
                style={{ transition: 'opacity .12s' }} />
            ))}

            {hover && (
              <circle cx={hover.x} cy={hover.y} r={dotR + 3.5} fill="none"
                stroke="var(--ink)" strokeWidth={1.2} />
            )}
          </svg>
        </div>

        <div className="flex flex-col gap-2 min-w-[168px]">
          {RINGS.map((r, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="rounded-full shrink-0" style={{ width: 9, height: 9, background: RING_COLOR[i] }} />
              <span className="font-[family-name:var(--f-mono)] text-[11.5px] flex-1" style={{ color: 'var(--ink-soft)' }}>
                {r.label}
              </span>
              <span className="font-[family-name:var(--f-mono)] text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>
                {perRing[i].toLocaleString()}
              </span>
            </div>
          ))}

          <div className="mt-2 pt-2 min-h-[46px]" style={{ borderTop: '1px solid var(--line)' }}>
            {hover ? (
              <>
                <div className="text-[15px] leading-tight"
                  style={{ fontFamily: cfg.scriptIsUnspaced ? 'var(--f-han)' : 'var(--f-display)', color: 'var(--ink)' }}>
                  {hover.word.h}
                </div>
                <div className="font-[family-name:var(--f-mono)] text-[11px] mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                  holds {Math.round(hover.stability).toLocaleString()} day{Math.round(hover.stability) === 1 ? '' : 's'}
                </div>
                {hover.word.m && (
                  <div className="text-[12px] mt-1 leading-snug line-clamp-2" style={{ color: 'var(--ink-faint)' }}>
                    {hover.word.m.split(/[;,]/)[0]}
                  </div>
                )}
              </>
            ) : (
              <div className="font-[family-name:var(--f-mono)] text-[11px] italic" style={{ color: 'var(--ink-faint)' }}>
                Hover a dot.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
