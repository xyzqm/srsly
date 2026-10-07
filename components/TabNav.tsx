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
              /**
               * ⚠ FOUR LONGHANDS, NEVER THE `border` SHORTHAND BESIDE `borderBottom`, AND THE
               * ⚠ COLOUR IS WHAT CHANGES — NOT WHETHER THERE IS A BORDER AT ALL.
               *
               * Two bugs in one line, and they compounded. It read
               * `border: active ? '1px solid var(--line)' : 'none'` with a `borderBottom`
               * longhand straight after, which is the React style-diffing trap: a shorthand
               * and one of its own longhands in the same object. React expands `border` into
               * longhands, the later `borderBottom` conflicts with them, and on a re-render the
               * shorthand is dropped — the DOM ends up with `border-top-width: ;` and friends
               * EMPTY. Read out of the live inline `style` attribute rather than reasoned
               * about. React warns about this in development and the warning had never been
               * acted on.
               *
               * With the width unspecified the computed border fell back inconsistently — 1px
               * on one tab and 3px (`medium`) on another — and because the row is a flex line,
               * EVERY button stretched to the tallest. So the nav measured **49.5px on Home and
               * 54.5px everywhere else**, and the whole page below it jumped 5px on every
               * Home↔other switch. That is the "layout moves vertically up and down" report,
               * and the scroll-position work could not touch it: the furniture itself was
               * resizing.
               *
               * Varying the COLOUR rather than the existence of the border is the fix for the
               * layout half and is worth stating as a rule: a selected state that adds a box
               * model property reflows everything around it. The border is always 1px; inactive
               * tabs just draw it in `transparent`.
               */
              borderTop: `1px solid ${active === t.id ? 'var(--line)' : 'transparent'}`,
              borderLeft: `1px solid ${active === t.id ? 'var(--line)' : 'transparent'}`,
              borderRight: `1px solid ${active === t.id ? 'var(--line)' : 'transparent'}`,
              borderBottom: `1px solid ${active === t.id ? 'var(--card)' : 'transparent'}`,
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
