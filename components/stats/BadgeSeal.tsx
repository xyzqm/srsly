import { toppedLadder, type BadgeMark } from '@/lib/achievements';

/**
 * A milestone drawn as a seal — a mark inside a ring that records how far up the ladder you are.
 *
 * ── WHY A SEAL AND NOT AN ICON ──
 * The badges were text pills, so `Vocabulary 1000` looked exactly like `Vocabulary 10` and a
 * row of twenty read as a tag cloud. A seal gives a milestone a SHAPE, which is the thing you
 * recognise across a panel without reading it, and it belongs to a reading app in a way a
 * trophy sprite would not.
 *
 * ── THE MARKS CARRY NO SCRIPT, ON PURPOSE ──
 * The obvious seal has a character in it. It must not: this panel is shared by all four
 * languages and is about none of them, so a 語 would be a Japanese glyph sitting in a Spanish
 * learner's stats — the same failure CLAUDE.md records for the hardcoded 空. Every mark here is
 * geometry, so there is nothing to translate and nothing that can be the wrong language.
 *
 * ── EARNED AND UNEARNED USE DIFFERENT RINGS, AND THAT IS THE POINT ──
 * Earned draws SEGMENTS: one arc per rung of the family, filled up to the rung reached, so
 * "3 of 5" is legible without a caption. Unearned draws a single CONTINUOUS arc for progress
 * toward the next rung. Two ring languages rather than one because they answer different
 * questions — what you have climbed versus how close the next step is — and a part-filled
 * segmented ring would confuse the two.
 *
 * Every colour is a CSS variable, so this follows all six themes; `color-mix` against
 * `transparent` is the same idiom MilestoneRing already uses for its softer arc.
 */

interface Props {
  mark: BadgeMark;
  /** 1-based rung reached (earned) or being aimed at (unearned). */
  tier: number;
  tierCount: number;
  earned: boolean;
  /** 0–1 toward the next rung. Drawn only when unearned. */
  progress?: number;
  size?: number;
}

const R_RING = 45;
const C = 2 * Math.PI * R_RING;

/**
 * Stroke-based marks on a 24×24 grid, drawn with `currentColor` so the ring's tier colour
 * carries into them and nothing has to be recoloured per theme.
 */
const MARKS: Record<BadgeMark, React.ReactNode> = {
  // A stack of cards — the deck itself.
  deck: <>
    <rect x="3.5" y="8.5" width="14" height="11" rx="2" />
    <path d="M7 5.5h11a2.5 2.5 0 0 1 2.5 2.5v9" />
  </>,
  // A word held at the centre and still holding — concentric, like a mark that has set.
  held: <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none" />
  </>,
  // A flame. Days in a row is the one milestone everybody already pictures this way.
  streak: <>
    <path d="M12 3.2c.4 3 1.9 4 3.3 5.6A6.2 6.2 0 0 1 17 13a5 5 0 0 1-10 0c0-1.9.7-3.2 1.8-4.4C10.1 7.2 11 5.6 12 3.2z" />
    <path d="M12 20a2.6 2.6 0 0 1-1.7-4.6c.8-.7 1.4-1.5 1.7-2.6.9 1.5 2.6 2.4 2.6 4.1A2.6 2.6 0 0 1 12 20z" />
  </>,
  // Coming back round again: a circle that closes with an arrowhead.
  sessions: <>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20.4 3.6v4.2h-4.2" />
  </>,
  // An open book, spine down the middle.
  book: <>
    <path d="M12 7.2v12" />
    <path d="M12 7.2C10.4 5.9 8.3 5.3 5 5.3v11.9c3.3 0 5.4.6 7 1.9" />
    <path d="M12 7.2c1.6-1.3 3.7-1.9 7-1.9v11.9c-3.3 0-5.4.6-7 1.9" />
  </>,
  // Two languages: two circles that overlap without becoming one.
  polyglot: <>
    <circle cx="9" cy="12" r="6.2" />
    <circle cx="15" cy="12" r="6.2" />
  </>,
  // Kept up in a single language — a centre with rays, drawn as devotion rather than a sun.
  devoted: <>
    <circle cx="12" cy="12" r="4.6" />
    <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.9 1.9M16.7 16.7l1.9 1.9M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9" />
  </>,
  /**
   * A card that dipped and came back up — the shape of a leech actually being fixed.
   *
   * Two earlier attempts failed at the size this is actually drawn. A chain link with a
   * diagonal across it read as the universal "prohibited" slash, so a milestone for repairing
   * a card looked like one for banning it; pulling the halves apart to drop the slash left two
   * floating hooks that read as nothing at all. Judged at 46px rather than blown up, which is
   * the only size that matters.
   */
  unstuck: <>
    <path d="M3 8.5 8.8 16.2 12.6 12.2 20.6 5.4" />
    <path d="M15.2 5.4h5.4v5.4" />
  </>,
};

export default function BadgeSeal({ mark, tier, tierCount, earned, progress = 0, size = 46 }: Props) {
  // Gold marks the top of a ladder, and only a real one — see toppedLadder.
  const maxed = earned && toppedLadder(tier, tierCount);
  const ink = maxed ? 'var(--gold)' : 'var(--accent)';
  const wash = maxed ? 'var(--gold-soft)' : 'var(--accent-soft)';

  // One arc per rung, with a gap between. A single-rung family gets a plain ring rather than
  // a "segment" that would be the whole circle anyway.
  const gap = tierCount > 1 ? Math.min(9, 34 / tierCount) : 0;
  const seg = C / tierCount - gap;

  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100" aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <circle cx="50" cy="50" r="38" fill={earned ? wash : 'var(--paper-2)'} />

      {earned ? (
        <g transform="rotate(-90 50 50)">
          {Array.from({ length: tierCount }, (_, i) => (
            <circle
              key={i} cx="50" cy="50" r={R_RING} fill="none" strokeLinecap="round"
              stroke={i < tier ? ink : 'var(--line)'}
              strokeWidth={i < tier ? 4.5 : 2.5}
              strokeDasharray={`${seg} ${C - seg}`}
              strokeDashoffset={-i * (C / tierCount) - gap / 2}
            />
          ))}
        </g>
      ) : (
        <g transform="rotate(-90 50 50)">
          <circle cx="50" cy="50" r={R_RING} fill="none" stroke="var(--line)" strokeWidth="2.5" />
          {progress > 0 && (
            <circle
              cx="50" cy="50" r={R_RING} fill="none" strokeLinecap="round"
              stroke="color-mix(in srgb, var(--accent) 72%, transparent)" strokeWidth="4.5"
              strokeDasharray={`${C * Math.min(1, progress)} ${C}`}
              style={{ transition: 'stroke-dasharray .5s ease' }}
            />
          )}
        </g>
      )}

      {/* The 24-grid mark, centred and scaled into the seal. */}
      <g
        transform="translate(50 50) scale(1.75) translate(-12 -12)"
        fill="none"
        stroke={earned ? ink : 'var(--ink-faint)'}
        strokeWidth={earned ? 1.7 : 1.5}
        strokeLinecap="round" strokeLinejoin="round"
        opacity={earned ? 1 : 0.45}
      >
        {MARKS[mark]}
      </g>
    </svg>
  );
}
