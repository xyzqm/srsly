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

  return (
    <div style={{ lineHeight: 1.5 }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span style={{ ...mono, fontSize: 13, color: 'var(--ink)', letterSpacing: 0 }}>
          {estimated ? 'about ' : ''}{pct}%
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
          at or below {bandName}
        </span>
        <span style={{ ...mono, fontSize: 9.5, textTransform: 'uppercase', color: tone }}>
          {label}
        </span>
      </div>

      {r.hardest.length > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 3, lineHeight: 1.5 }}>
          Hardest here:{' '}
          {r.hardest.map((h, i) => (
            <span key={h.word}>
              {i > 0 && ', '}
              <span style={{ color: 'var(--ink)' }}>{h.word}</span>
              {h.count > 1 && <span style={{ opacity: .6 }}> ×{h.count}</span>}
            </span>
          ))}
        </div>
      )}

      <div style={{ ...mono, fontSize: 9.5, color: 'var(--ink-faint)', marginTop: 3, opacity: .7 }}>
        {estimated ? 'estimated from a few excerpts · ' : ''}
        {r.tokens} words, {r.types} distinct
        {/* Named rather than hidden: a novel is full of character names, which are filtered out
            of the dictionary at build time and so cannot be graded either way. */}
        {r.unresolved > 0 && ` · ${r.unresolved} names or unknowns not counted`}
      </div>
    </div>
  );
}
