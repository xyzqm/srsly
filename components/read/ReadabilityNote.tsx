'use client';
import { useLanguage } from '@/lib/LanguageContext';
import { levelLabel } from '@/lib/languageConfig';
import type { Readability } from '@/lib/readability';

/**
 * How much of this text sits at or below your level.
 *
 * INFORMATION, NEVER A GATE. This file's position is that levels are calibration and a map
 * rather than the goal, and nothing here blocks or discourages opening anything: it reports a
 * figure next to the text, not in front of it, and there is no threshold below which anything
 * is withheld. A book you badly want to read at 40% coverage is still a book worth opening.
 *
 * It is deliberately NOT shown in the paste panel before reading. You have already chosen to
 * read that text, so a score there is friction rather than help, and it would cost a
 * segmentation round-trip to produce before you could start.
 */

interface Props {
  readability: Readability | null;
  /** An estimate from samples rather than a full count, which must be said out loud. */
  estimated?: boolean;
  /** Compact enough to sit inline next to other metadata. */
  compact?: boolean;
}

const mono: React.CSSProperties = { fontFamily: 'var(--f-mono)', letterSpacing: '.06em' };

/**
 * Bands the figure into a phrase, because the number alone does not say what to do with it.
 * The thresholds follow the usual reading-comprehension rule of thumb: around 95% of running
 * words known is comfortable independent reading, and below about 80% a text stops being
 * readable with a dictionary and starts being decoded word by word.
 */
function verdict(pct: number): { label: string; tone: string } {
  if (pct >= 95) return { label: 'comfortable', tone: 'var(--jade)' };
  if (pct >= 85) return { label: 'a stretch', tone: 'var(--jade)' };
  if (pct >= 75) return { label: 'hard going', tone: 'var(--gold)' };
  return { label: 'very hard', tone: 'var(--gold)' };
}

export default function ReadabilityNote({ readability: r, estimated, compact }: Props) {
  const language = useLanguage();
  if (!r) return null;

  const pct = Math.round(r.coverage * 100);
  const { label, tone } = verdict(pct);
  const bandName = levelLabel(language, r.level);

  if (compact) {
    return (
      <span style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)' }}>
        {estimated ? '~' : ''}{pct}% <span style={{ color: tone }}>{label}</span>
      </span>
    );
  }

  /**
   * ── THE BLOCK IS PLACED RIGHT AND READ LEFT ──────────────────────────────
   *
   * It sits in a right-hand column, and the caller used to right-align the TEXT as well. That
   * is fine for one line and bad for four of very different lengths: "90%…", a list of five
   * hard words and a count of distinct types have nothing in common at their right edge, so
   * every line started in a different place and the eye had no column to run down. Reported
   * as "make this thing formatted better", which is what a ragged left edge looks like from
   * the outside.
   *
   * `inline-block` keeps the BLOCK hugging the right of its column — the placement was never
   * the problem — while everything inside shares one left edge. `maxWidth` stops the hardest
   * list, which is the only line whose length the data controls, from stretching the whole
   * thing across the passage.
   */
  return (
    <div style={{ display: 'inline-block', textAlign: 'left', maxWidth: 320, lineHeight: 1.5 }}>
      {/*
        ONE LINE FOR THE ANSWER. The figure, what it is a figure OF, and what it means were
        three competing type treatments on one row — a mono number, body text and a shouted
        uppercase tag in a colour. The verdict is the only part that needs emphasis, and it
        gets it from the colour it already had rather than from capitals as well.
      */}
      <div style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>
        <span style={{ ...mono, fontSize: 14, color: 'var(--ink)', letterSpacing: 0, fontWeight: 500 }}>
          {estimated ? '~' : ''}{pct}%
        </span>
        {' '}at or below {bandName}
        {' · '}
        <span style={{ color: tone, fontWeight: 500 }}>{label}</span>
      </div>

      {r.hardest.length > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 4, lineHeight: 1.55 }}>
          <span style={{ ...mono, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.12em', opacity: .75 }}>
            Hardest
          </span>{' '}
          {r.hardest.map((h, i) => (
            <span key={h.word}>
              {i > 0 && ', '}
              <span style={{ color: 'var(--ink)' }}>{h.word}</span>
              {h.count > 1 && <span style={{ opacity: .6 }}> ×{h.count}</span>}
            </span>
          ))}
        </div>
      )}

      {/* Separators are all `·` now. It read "88 words, 59 distinct · 2 names…", mixing a comma
          and a middot for the same job, so the three facts looked like two. */}
      <div style={{ ...mono, fontSize: 9.5, color: 'var(--ink-faint)', marginTop: 4, opacity: .7, letterSpacing: '.04em' }}>
        {estimated ? 'estimated from excerpts · ' : ''}
        {r.tokens} words · {r.types} distinct
        {/* Named rather than hidden: a novel is full of character names, which are filtered out
            of the dictionary at build time and so cannot be graded either way. */}
        {r.unresolved > 0 && ` · ${r.unresolved} not counted`}
      </div>
    </div>
  );
}
