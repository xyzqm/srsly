'use client';
import { useState } from 'react';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { useSRS } from '@/hooks/useSRS';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import PieChart from './PieChart';
import MilestoneRing from './MilestoneRing';
import Achievements from './Achievements';
import ReviewHeatmap from './ReviewHeatmap';
import FutureLoad from './FutureLoad';
import LevelProgress from './LevelProgress';
import WeakWords from './WeakWords';

/**
 * ── NINE PANELS IN ONE COLUMN WAS NOT A PAGE, IT WAS A SCROLL ────────────────
 *
 * Stats stacked the milestone ring, the badge cabinet, weak words, the heatmap, the forecast,
 * the phase breakdown, level progress, reading accuracy and the passage shelf, and then a row
 * of summary figures at the very bottom — so the three numbers most worth seeing were the ones
 * furthest from the top, and everything in between had to be scrolled past whichever one you
 * came for. Reported as "way too long; separate them into categories just like in the
 * settings", which is the right instinct and the right precedent: `SettingsTab` already
 * answers exactly this shape, so this borrows its groups rather than inventing a second idiom.
 *
 * ── AND TWO PANELS LEFT ENTIRELY ─────────────────────────────────────────────
 *
 * Reading accuracy and the passage shelf are both about READING — the share of blanks filled
 * on the first go, and every passage finished — so they now live under Read, beside the
 * passages they describe, rather than in a tab about the deck. Moving them is the same
 * argument that moved generation: a thing belongs where you would go looking for it.
 *
 * ── THE STREAK MOVED UP, WHICH IS A PRODUCT DECISION ─────────────────────────
 *
 * It was in a footer grid below nine panels. A streak is the one number here whose job is to
 * bring somebody back tomorrow, and it cannot do that from the bottom of a page nobody reaches.
 * It leads the Overview now.
 */

const GROUPS = [
  { id: 'overview'   as const, label: 'Overview' },
  { id: 'milestones' as const, label: 'Milestones' },
  { id: 'deck'       as const, label: 'Deck' },
  { id: 'schedule'   as const, label: 'Schedule' },
];
type Group = (typeof GROUPS)[number]['id'];

const mono = { fontFamily: 'var(--f-mono)' } as const;

const statLabel: React.CSSProperties = {
  ...mono, fontSize: 10.5, letterSpacing: '.16em',
  textTransform: 'uppercase', color: 'var(--ink-faint)',
};
const statNote: React.CSSProperties = {
  ...mono, fontSize: 10, color: 'var(--ink-faint)', marginTop: 5, lineHeight: 1.4,
};

interface Props { onNavigateRead: () => void; }

export default function StatsTab({ onNavigateRead }: Props) {
  const language = useLanguage();
  const { deck } = useVocabDeck(language);
  const { streak, langStreak, sessions, forgiven } = useSRS(language);
  const [group, setGroup] = useState<Group>(GROUPS[0].id);

  return (
    <div
      className="rounded-tr-xl rounded-b-xl px-4 py-5 sm:px-9 sm:py-8 animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
      {/* The same control Settings uses, deliberately: one idiom for one interaction. */}
      <div className="flex gap-1.5 flex-wrap mb-6">
        {GROUPS.map(g => {
          const on = g.id === group;
          return (
            <button
              key={g.id}
              onClick={() => setGroup(g.id)}
              className="cursor-pointer transition-all duration-150"
              style={{
                ...mono, fontSize: 11.5, letterSpacing: '.08em',
                padding: '7px 13px', borderRadius: 8,
                border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                background: on ? 'var(--accent-soft)' : 'var(--card)',
                color: on ? 'var(--accent)' : 'var(--ink-soft)',
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {group === 'overview' && (<>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 500, letterSpacing: '-.015em', margin: '0 0 4px', lineHeight: 1.15 }}>
          <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>{deck.length}</em> word{deck.length === 1 ? '' : 's'} in your deck.
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14.5, maxWidth: '46ch', lineHeight: 1.55 }}>
          {deck.length === 0
            ? 'Your deck is empty. Read a passage and click underlined words to start building it.'
            : 'Your complete vocabulary broken down by SRS mastery phase.'}
        </p>

        {/*
          THE STREAK FIRST, AND THE DECK COUNT NOT REPEATED.
          This was a three-cell grid at the very bottom of the page whose first cell printed
          the deck size — the number already set in display type two lines above it. A figure
          stated twice on one screen is not emphasis, it is a reader wondering which one to
          believe. The streak takes the lead cell instead, which is what it is for.
        */}
        <div
          className="grid mt-7 overflow-hidden rounded-[11px]"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, background: 'var(--line-soft)', border: '1px solid var(--line)' }}
        >
          <div className="px-5 py-5" style={{ background: 'var(--paper-2)' }}>
            <div style={statLabel}>Day streak</div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 38, fontWeight: 500, letterSpacing: '-.02em', marginTop: 4, lineHeight: 1 }}>
              {streak}<small style={{ fontSize: 14, color: 'var(--ink-faint)', ...mono, fontWeight: 400 }}>d</small>
            </div>
            {/* Say which days were rest. A streak that quietly counts days you did nothing is
                the dishonest kind; naming them is what makes counting them defensible. */}
            {forgiven > 0 && (
              <div style={statNote}>
                incl. {forgiven} rest day{forgiven === 1 ? '' : 's'}
                <span style={{ opacity: 0.75 }}> · nothing was due</span>
              </div>
            )}
            {/* The language's own run, under the all-languages one. Only when they differ:
                for a learner studying one language they are the same number, and printing it
                twice would imply a distinction that is not there. */}
            {langStreak !== streak && (
              <div style={statNote}>
                {langStreak}d in {getLanguageConfig(language).name}
                <span style={{ opacity: 0.75 }}> · this language alone</span>
              </div>
            )}
          </div>

          {/*
            "TOTAL SESSIONS" MEANT NOTHING, AND THE FIX WAS TO READ THE CODE RATHER THAN
            REWORD THE LABEL. `useSRS` increments it only when `todayScoreDate !== today` —
            the FIRST score of a day and never a second — so it has always counted days
            studied, while the word "sessions" promised something finer and invited the
            question "what counts as one?". Nothing about the number changed; it is now called
            what it has always been, with the definition under it so nobody has to ask again.
          */}
          <div className="px-5 py-5" style={{ background: 'var(--card)' }}>
            <div style={statLabel}>Days studied</div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 38, fontWeight: 500, letterSpacing: '-.02em', marginTop: 4, lineHeight: 1 }}>
              {sessions}
            </div>
            <div style={statNote}>
              <span style={{ opacity: 0.75 }}>days you studied at all, ever</span>
            </div>
          </div>
        </div>

        <button
          onClick={onNavigateRead}
          className="mt-5 flex items-center gap-2 cursor-pointer transition-all duration-150"
          style={{
            ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)', display: 'inline-flex',
          }}
        >
          Open today&apos;s passage
        </button>

        <MilestoneRing deck={deck} language={language} />
      </>)}

      {group === 'milestones' && <Achievements />}

      {group === 'deck' && (<>
        <PieChart deck={deck} />
        <LevelProgress deck={deck} language={language} />
        <WeakWords deck={deck} />
      </>)}

      {group === 'schedule' && (<>
        <ReviewHeatmap deck={deck} />
        <FutureLoad deck={deck} />
      </>)}
    </div>
  );
}
