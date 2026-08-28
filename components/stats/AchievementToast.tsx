'use client';
import { useEffect, useRef, useState } from 'react';
import { useAchievements } from '@/hooks/useAchievements';
import { collapse, toppedLadder, type EarnedAchievement } from '@/lib/achievements';
import BadgeSeal from './BadgeSeal';
import { claimCompletionSurface, releaseCompletionSurface } from '@/lib/completionSurface';

/**
 * Announce a milestone the moment it is crossed — once.
 *
 * Rendered at the two places that already say "you finished": the flashcard session-complete
 * block and the reading results screen, beside the daily proverb. That placement is the whole
 * design. A milestone popped mid-session interrupts the thing it is rewarding, and a learner
 * who is mid-review does not want a modal; on a completion screen it is the send-off.
 *
 * `fresh` is empty on a first run by construction (see lib/achievementsSeen.ts), so someone
 * arriving with a full deck is not met with a dozen of these.
 */
export default function AchievementToast() {
  const { fresh, acknowledge } = useAchievements();

  /**
   * Claim the announcement for this screen, DURING RENDER rather than in an effect.
   *
   * `ToastHost` decides whether to announce inside its own effect, and React runs every
   * render in a commit before any effect in it — so claiming here is what makes the outcome
   * independent of which component happens to sit first in the tree. The claim is made
   * unconditionally, before the early return below: the point is to hold the announcement
   * for this screen even in the moment before `fresh` has resolved, or the floating toast
   * would win the gap. See lib/completionSurface.ts.
   */
  const key = useRef({}).current;
  claimCompletionSurface(key);
  useEffect(() => () => releaseCompletionSurface(key), [key]);

  /**
   * What to DISPLAY, held separately from what is still unannounced.
   *
   * These two look like the same list and are not, which cost a bug: acknowledging empties
   * `fresh`, so rendering straight from it made the milestone vanish about a second after it
   * appeared. Recording that something has been announced must not be the same act as taking
   * it off the screen — the learner needs it to stay put for the whole completion screen.
   */
  const [shown, setShown] = useState<EarnedAchievement[]>([]);

  useEffect(() => {
    if (fresh.length === 0) return;
    setShown(prev => {
      const have = new Set(prev.map(a => a.id));
      return [...prev, ...fresh.filter(a => !have.has(a.id))];
    });
    // Persist immediately. If the learner navigates away without reading it, it has still
    // been shown, and re-announcing on every later visit is worse than missing one once.
    acknowledge();
  }, [fresh, acknowledge]);

  if (shown.length === 0) return null;

  /**
   * Announce the RUNG, not every rung crossed. Importing a level can clear three thresholds of
   * one family at once, and three near-identical cards saying Vocabulary 10, 50 and 100 reads
   * as a bug. `acknowledge` still marks all of them seen, so nothing is re-announced later.
   */
  const badges = collapse(shown, 'last');

  return (
    <div className="flex flex-col gap-2 mb-5">
      {badges.map(b => {
        const maxed = toppedLadder(b.tier, b.tierCount);
        return (
          <div
            key={b.family.key}
            role="status"
            className="rounded-[12px] px-4 py-3.5 flex items-center gap-3.5 animate-badge"
            style={{
              background: maxed ? 'var(--gold-soft)' : 'var(--accent-soft)',
              border: `1px solid ${maxed ? 'var(--gold)' : 'var(--accent)'}`,
            }}
          >
            <BadgeSeal
              mark={b.family.mark} tier={b.tier} tierCount={b.tierCount} earned size={52}
            />
            <div className="flex flex-col gap-0.5 min-w-0">
              <div style={{
                fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em',
                textTransform: 'uppercase', color: maxed ? 'var(--gold)' : 'var(--accent)',
              }}>
                {maxed ? 'Milestone · maxed' : 'Milestone'}
              </div>
              <div style={{ fontSize: 15, color: 'var(--ink)', fontWeight: 500 }}>{b.a.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45 }}>{b.a.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
