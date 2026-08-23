'use client';
import { useAchievements } from '@/hooks/useAchievements';
import type { EarnedAchievement } from '@/lib/achievements';

/**
 * Milestones earned, and the ones you are closest to.
 *
 * The streak answers "did you show up today" and stops there. This is the longer arc — and
 * the half that matters most is `next`, not `earned`: a cabinet of things already done is
 * pleasant and changes nothing, while "3 more words to 50" is a reason to open the app on a
 * day the streak is already safe.
 *
 * Deliberately shows only a few of each. The full list is 20-odd rows, which turns a reward
 * into a chore to scroll, and the ones far away are not motivating anyway.
 */

const NEXT_SHOWN = 3;

const mono = { fontFamily: 'var(--f-mono)' } as const;
const label = {
  ...mono, fontSize: 11, letterSpacing: '.2em',
  textTransform: 'uppercase' as const, color: 'var(--ink-faint)',
};

function Bar({ have, need }: { have: number; need: number }) {
  const pct = Math.max(0, Math.min(100, (have / need) * 100));
  return (
    <div className="rounded-full overflow-hidden" style={{ height: 5, background: 'var(--line)' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
    </div>
  );
}

function NextRow({ a }: { a: EarnedAchievement }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>{a.name}</span>
        <span style={{ ...mono, fontSize: 11.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
          {a.have}/{a.need}
        </span>
      </div>
      <Bar have={a.have} need={a.need} />
      <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.45 }}>{a.description}</div>
    </div>
  );
}

export default function Achievements() {
  const { earned, next, ready } = useAchievements();

  if (!ready) return null;

  // Nothing earned and nothing close means a brand-new account. A panel of empty progress
  // bars is a list of things you have failed to do — say nothing until there is something.
  if (earned.length === 0 && next.every(a => a.have === 0)) return null;

  return (
    <div className="rounded-[14px] px-5 py-5 mb-5" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
      <div style={label}>Milestones</div>

      {next.length > 0 && (
        <div className="flex flex-col gap-4 mt-4">
          {next.slice(0, NEXT_SHOWN).map(a => <NextRow key={a.id} a={a} />)}
        </div>
      )}

      {earned.length > 0 && (
        <div className={next.length > 0 ? 'mt-5 pt-4' : 'mt-4'}
             style={next.length > 0 ? { borderTop: '1px solid var(--line-soft)' } : undefined}>
          <div style={{ ...mono, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
            Earned · {earned.length}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {earned.map(a => (
              <span
                key={a.id}
                title={a.description}
                className="rounded-full px-2.5 py-1"
                style={{ ...mono, fontSize: 11, background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}
              >
                {a.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
