'use client';
import type { TabId } from '@/lib/types';
import { useLanguage } from '@/lib/LanguageContext';
import { hasLessons } from '@/lib/lessons';

/**
 * The visible name is REVIEW; the id stays `practice` and the code stays SRS.
 *
 * It was "SRS" until 2026-09-12, then "Practice", and is now "Review" — the moves are worth
 * keeping straight because each fixed a real thing and the last one was made possible by the
 * generated passage leaving.
 *
 * "SRS" is a term of art: precise to somebody who already knows what spaced repetition is,
 * meaningless to everybody else, which is most people meeting the app. "Practice" was the
 * plain-language fix and was slightly wrong, because the tab also held the generated passage —
 * reading, not drilling. With that moved to Read, what is left is cards, handwriting and
 * conjugation: a queue of things the scheduler says are due. That is a review.
 *
 * IT ALSO RESOLVES A COLLISION rather than just renaming one. The Learn tab has a "Start
 * practice" button which deliberately grades NOTHING — a lesson you can fail is a lesson you
 * avoid — so the app had two things called practice doing opposite things. Only one of them
 * is a review.
 *
 * NOTHING UNDERNEATH IS RENAMED. The `TabId` is already `practice`, `ReadTab`'s `variant`
 * stays `'srs'`, and the `srs_state` column keeps its name. Those name the SCHEDULER, which
 * did not change — and renaming a synced column to match a label is a migration bought with
 * nothing.
 */
const TABS: { id: TabId; label: string }[] = [
  { id: 'dash',     label: 'Home' },
  { id: 'practice', label: 'Review' },
  { id: 'read',     label: 'Read' },
  { id: 'learn',    label: 'Learn' },
  { id: 'vocab',    label: 'Vocab' },
  { id: 'settings', label: 'Settings' },
];

interface Props { active: TabId; onChange: (id: TabId) => void; }

export default function TabNav({ active, onChange }: Props) {
  // Learn is hidden where there is no lesson tree rather than shown empty — an empty tab
  // reads as a broken one. All four languages have one today (see lib/lessons.ts).
  const language = useLanguage();
  const tabs = TABS.filter(t => t.id !== 'learn' || hasLessons(language));

  return (
    <nav className="max-w-[1200px] mx-auto px-3 sm:px-7 relative z-[1]">
      {/* Six tabs do not fit a 375px screen, so the row scrolls. `scrollbarWidth: none`
          hides the only hint that it does, which is why Settings looked simply missing —
          `tab-scroll` fades the right edge while there is more to reach, and scroll-snap
          makes a flick land on a tab rather than half of one. */}
      <div className="flex gap-1 pt-3.5 overflow-x-auto tab-scroll"
           style={{ scrollbarWidth: 'none', scrollSnapType: 'x proximity' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="cursor-pointer whitespace-nowrap transition-all duration-[180ms] tab-btn"
            style={{
              scrollSnapAlign: 'start',
              fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
              background: active === t.id ? 'var(--card)' : 'none',
              color: active === t.id ? 'var(--accent)' : 'var(--ink-faint)',
              border: active === t.id ? '1px solid var(--line)' : 'none',
              borderBottom: active === t.id ? '1px solid var(--card)' : 'none',
              borderRadius: '7px 7px 0 0',
              padding: '9px 13px',
              marginBottom: active === t.id ? -1 : 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
