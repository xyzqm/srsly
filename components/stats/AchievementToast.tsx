'use client';
import { useEffect, useState } from 'react';
import { useAchievements } from '@/hooks/useAchievements';
import type { EarnedAchievement } from '@/lib/achievements';

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

  return (
    <div className="flex flex-col gap-2 mb-5">
      {shown.map(a => (
        <div
          key={a.id}
          role="status"
          className="rounded-[12px] px-4 py-3 flex items-baseline gap-3"
          style={{ background: 'var(--paper-2)', border: '1px solid var(--accent)' }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>🏅</span>
          <div className="flex flex-col gap-0.5">
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--accent)' }}>
              Milestone
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{a.name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45 }}>{a.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
