'use client';
import { useAchievements } from '@/hooks/useAchievements';
import { collapse, toppedLadder, type Badge } from '@/lib/achievements';
import BadgeSeal from './BadgeSeal';

/**
 * Milestones earned, and the ones you are closest to.
 *
 * The streak answers "did you show up today" and stops there. This is the longer arc — and
 * the half that matters most is `next`, not `earned`: a cabinet of things already done is
 * pleasant and changes nothing, while "3 more words to 50" is a reason to open the app on a
 * day the streak is already safe.
 *
 * ── ONE BADGE PER FAMILY ──
 * Every threshold used to earn its own pill, so passing 100 words printed `Vocabulary 10`,
 * `Vocabulary 50` and `Vocabulary 100` at once — twenty-odd identical grey tags in which the
 * hardest milestone was indistinguishable from the easiest. `collapse` keeps only the rung you
 * are standing on and the seal's ring carries the rest, which is both fewer things to read and
 * more information in each one.
 *
 * Still only a few of `next`: the ones far away are not motivating, and a wall of unfinished
 * progress is a list of things you have not done.
 */

const NEXT_SHOWN = 3;

const mono = { fontFamily: 'var(--f-mono)' } as const;
const label = {
  ...mono, fontSize: 11, letterSpacing: '.2em',
  textTransform: 'uppercase' as const, color: 'var(--ink-faint)',
};

/** A milestone already reached: the mark at full strength, its ladder drawn around it. */
function EarnedBadge({ b }: { b: Badge }) {
  const maxed = toppedLadder(b.tier, b.tierCount);
  return (
    <div
      className="flex flex-col items-center text-center gap-1.5 rounded-[11px] px-1.5 py-3"
      title={b.a.description}
      style={{ background: 'var(--paper-2)', border: '1px solid var(--line-soft)' }}
    >
      <BadgeSeal mark={b.family.mark} tier={b.tier} tierCount={b.tierCount} earned size={48} />
      <div style={{ fontSize: 11.5, color: 'var(--ink)', lineHeight: 1.3 }}>{b.a.name}</div>
      {b.tierCount > 1 && (
        <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.1em', color: maxed ? 'var(--gold)' : 'var(--ink-faint)' }}>
          {maxed ? 'MAX' : `${b.tier}/${b.tierCount}`}
        </div>
      )}
    </div>
  );
}

/**
 * A milestone ahead: the same seal with its ring showing how close it is.
 *
 * The flat progress bar this replaces said the same thing in a second visual language, one
 * row below the badge it described. The ring IS the bar, bent around the mark it belongs to.
 */
function NextRow({ b }: { b: Badge }) {
  const { have, need } = b.a;
  return (
    <div className="flex items-center gap-3.5">
      <BadgeSeal
        mark={b.family.mark} tier={b.tier} tierCount={b.tierCount}
        earned={false} progress={need > 0 ? have / need : 0} size={44}
      />
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>{b.a.name}</span>
          <span style={{ ...mono, fontSize: 11.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
            {have}/{need}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.45 }}>{b.a.description}</div>
      </div>
    </div>
  );
}

export default function Achievements() {
  const { earned, next, ready } = useAchievements();

  if (!ready) return null;

  // Nothing earned and nothing close means a brand-new account. A panel of empty progress
  // bars is a list of things you have failed to do — say nothing until there is something.
  if (earned.length === 0 && next.every(a => a.have === 0)) return null;

  // Best first, so a maxed-out ladder leads rather than being buried in declaration order.
  const earnedBadges = collapse(earned, 'last')
    .sort((x, y) => y.tier / y.tierCount - x.tier / x.tierCount || y.tier - x.tier);
  // `next` arrives sorted by how close it is, so the first of each family is the nearest.
  const nextBadges = collapse(next, 'first').slice(0, NEXT_SHOWN);

  return (
    <div className="rounded-[14px] px-5 py-5 mb-5" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
      <div style={label}>Milestones</div>

      {nextBadges.length > 0 && (
        <div className="flex flex-col gap-4 mt-4">
          {nextBadges.map(b => <NextRow key={b.family.key} b={b} />)}
        </div>
      )}

      {earnedBadges.length > 0 && (
        <div className={nextBadges.length > 0 ? 'mt-5 pt-4' : 'mt-4'}
             style={nextBadges.length > 0 ? { borderTop: '1px solid var(--line-soft)' } : undefined}>
          <div style={{ ...mono, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
            Earned · {earned.length}
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))' }}>
            {earnedBadges.map(b => <EarnedBadge key={b.family.key} b={b} />)}
          </div>
        </div>
      )}
    </div>
  );
}
