'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LessonExample } from '@/lib/lessons';

/**
 * Build the sentence from its words — the practice half of a grammar lesson.
 *
 * ── IT CHECKS ORDER, NOT SPELLING ──
 * The tiles are the sentence already; the only thing being asked is whether the learner can put
 * them in the right order. That is exactly the skill a grammar lesson teaches — where the
 * object pronoun goes, which particle follows which noun, whether the verb comes last — and it
 * is a skill you can have without being able to spell a word yet.
 *
 * ── IT TOUCHES NO SCHEDULING STATE ──
 * Getting one wrong costs nothing, records nothing, and schedules nothing. The curriculum is
 * deliberately separate from FSRS (see lib/lessons.ts), and a wrong answer here must not
 * reappear as a review tomorrow — that would make practising a lesson something a learner
 * could come to dread.
 *
 * A tile can always be taken back out, and the answer can be checked as often as you like.
 */

interface Props {
  example: LessonExample;
  /** Chinese and Japanese are written without spaces between words. */
  unspaced: boolean;
}

/** Fisher–Yates on a copy, and never the original order — a "shuffle" that solves itself once
 *  in every few lessons reads as a bug rather than as luck. */
function shuffled(tiles: string[]): number[] {
  const idx = tiles.map((_, i) => i);
  if (idx.length < 2) return idx;
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    if (idx.some((v, i) => v !== i)) return idx;
  }
  return idx.reverse();
}

const mono: React.CSSProperties = { fontFamily: 'var(--f-mono)', letterSpacing: '.06em' };

export default function SentenceBuilder({ example, unspaced }: Props) {
  const tiles = useMemo(() => example.tiles ?? [], [example]);
  const [pool, setPool] = useState<number[]>(() => shuffled(tiles));
  const [picked, setPicked] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);

  // A new example is a new puzzle, and a half-built answer from the previous one is confusing.
  useEffect(() => {
    setPool(shuffled(tiles));
    setPicked([]);
    setChecked(false);
  }, [tiles]);

  const take = useCallback((i: number) => {
    setPool(p => p.filter(x => x !== i));
    setPicked(p => [...p, i]);
    setChecked(false);
  }, []);

  const putBack = useCallback((i: number) => {
    setPicked(p => p.filter(x => x !== i));
    setPool(p => [...p, i]);
    setChecked(false);
  }, []);

  const complete = picked.length === tiles.length;
  const correct = complete && picked.every((v, i) => v === i);

  const reset = useCallback(() => {
    setPool(shuffled(tiles));
    setPicked([]);
    setChecked(false);
  }, [tiles]);

  if (tiles.length < 2) return null;

  const tile = (label: string, onClick: () => void, key: number, tone?: string) => (
    <button
      key={key}
      onClick={onClick}
      className="rounded-lg cursor-pointer transition-all duration-150"
      style={{
        fontSize: 15,
        padding: '7px 12px',
        background: 'var(--card)',
        border: `1px solid ${tone ?? 'var(--line)'}`,
        color: tone ?? 'var(--ink)',
        lineHeight: 1.3,
      }}
    >
      {label}
    </button>
  );

  const tone = !checked ? undefined : correct ? 'var(--jade)' : 'var(--gold)';

  return (
    <div className="mt-4">
      <div style={{ ...mono, fontSize: 9.5, textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
        Build the sentence
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 10 }}>{example.gloss}</div>

      {/* The answer row. Always at least as tall as a tile, so the layout does not jump on the
          first tap — a shifting page while you are aiming at a small target is its own bug. */}
      <div
        className="flex flex-wrap gap-2 items-center rounded-lg px-3"
        style={{
          minHeight: 46,
          borderBottom: `2px solid ${tone ?? 'var(--line)'}`,
          paddingTop: 6, paddingBottom: 6, marginBottom: 12,
        }}
      >
        {picked.length === 0 && (
          <span style={{ fontSize: 12.5, color: 'var(--ink-faint)', opacity: .7 }}>
            tap the words in order
          </span>
        )}
        {picked.map(i => tile(tiles[i], () => putBack(i), i, tone))}
      </div>

      <div className="flex flex-wrap gap-2 mb-3" style={{ minHeight: 34 }}>
        {pool.map(i => tile(tiles[i], () => take(i), i))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setChecked(true)}
          disabled={!complete}
          className="rounded-lg transition-all duration-150"
          style={{
            ...mono, fontSize: 10.5, padding: '8px 14px', fontWeight: 600, border: 'none',
            background: complete ? 'var(--jade)' : 'none',
            color: complete ? '#fff' : 'var(--ink-faint)',
            cursor: complete ? 'pointer' : 'default',
          }}
        >
          Check
        </button>

        {checked && correct && (
          <span style={{ ...mono, fontSize: 11, color: 'var(--jade)' }}>✓ that&rsquo;s it</span>
        )}
        {checked && !correct && (
          <>
            <span style={{ ...mono, fontSize: 11, color: 'var(--gold)' }}>not yet</span>
            <button
              onClick={reset}
              className="cursor-pointer"
              style={{ ...mono, fontSize: 10.5, background: 'none', border: 'none', color: 'var(--ink-faint)', padding: 0 }}
            >
              start over
            </button>
          </>
        )}
      </div>

      {/* Shown only once it is right. Before that it would simply be the answer. */}
      {checked && correct && (
        <div style={{ fontSize: 15.5, color: 'var(--ink)', marginTop: 10, lineHeight: 1.5 }}>
          {unspaced ? example.text : tiles.join(' ')}
        </div>
      )}
    </div>
  );
}
