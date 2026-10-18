'use client';
import { useEffect, useState } from 'react';
import TabPanel from '@/components/TabPanel';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { isDueToday, todayStr } from '@/lib/deck';
import { useSRS } from '@/hooks/useSRS';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import { hasLessons, courseProgress } from '@/lib/lessons';
import { storage } from '@/lib/storage';
import { xpThisWeek } from '@/lib/xp';
import type { DayActivity } from '@/lib/activityLog';
import PieChart from './PieChart';
import MilestoneRing from './MilestoneRing';
import Achievements from './Achievements';
import ReviewHeatmap from './ReviewHeatmap';
import FutureLoad from './FutureLoad';
import RetentionPanel from './RetentionPanel';
import LevelProgress from './LevelProgress';
import WeakWords from './WeakWords';
import YearInReading from './YearInReading';
import PactPanel from './PactPanel';

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

interface Props {
  onNavigateRead: () => void;
  /** Into the drill tab, for the second of the two things a learner can do next. */
  onNavigateReview: () => void;
  /**
   * Into the course. Offered only on an EMPTY deck, and only where a course exists — see the
   * empty-state comment below for why that is the one state where it outranks reading.
   */
  onNavigateLearn: () => void;
}

export default function StatsTab({ onNavigateRead, onNavigateReview, onNavigateLearn }: Props) {
  const language = useLanguage();
  /** Whether this language has a course to send a brand-new learner into. */
  const courseAvailable = hasLessons(language);
  /**
   * Finished lesson ids, for the course line below. `null` until storage answers, which is
   * NOT the same as "none finished" — rendering the second as the first would tell a learner
   * halfway through the course that they had read nothing. The line simply waits.
   */
  const [lessonsDone, setLessonsDone] = useState<string[] | null>(null);
  useEffect(() => {
    if (!courseAvailable) return;
    let live = true;
    storage.getLessonsDone()
      .then(ids => { if (live) setLessonsDone(ids); })
      .catch(() => { if (live) setLessonsDone([]); });
    return () => { live = false; };
  }, [courseAvailable]);
  const { done: courseDone, total: courseTotal } =
    courseProgress(language, new Set(lessonsDone ?? []));

  /**
   * XP THIS WEEK — derived on read, like everything else on this screen.
   *
   * `lib/xp.ts` explains why the window is a week rather than a lifetime: the activity log is
   * PRUNED at 400 days, so a lifetime total derived from it would quietly fall as old days
   * aged out, and an XP counter that goes down is worse than none.
   *
   * The log is global across languages and the shelf is per language, so this counts cards and
   * lessons from everywhere and passages from the language on screen. That asymmetry is real
   * and is the honest trade: reading four shelves to balance it would cost three round trips
   * for a motivational figure, and the one on screen is the one being studied.
   */
  const [xpSource, setXpSource] = useState<{ log: DayActivity[]; passageDates: string[] } | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([storage.getActivityLog(), storage.getShelf(language)])
      .then(([log, shelf]) => {
        if (live) setXpSource({ log, passageDates: shelf.map(e => e.date) });
      })
      .catch(() => { if (live) setXpSource({ log: [], passageDates: [] }); });
    return () => { live = false; };
  }, [language]);
  const xp = xpSource ? xpThisWeek(xpSource, todayStr()) : null;
  const { deck, deckLoaded } = useVocabDeck(language);
  const { streak, langStreak, sessions, forgiven } = useSRS(language);
  /**
   * WHAT YOU OWE TODAY — the one number a page like this was missing.
   *
   * Everything else here is retrospective: words collected, days studied, a streak already
   * earned. None of it answers "what do I do now", which is the question somebody opening the
   * app is actually asking. Counted with the SAME filter `Flashcards` builds its queue from,
   * because a dashboard promising 4 due and a drill offering 6 is worse than no number.
   */
  const dueToday = deckLoaded ? deck.filter(w => isDueToday(w, todayStr())).length : null;
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

      {/*
        ── A CONDITIONAL RENDER IS A REMOUNT, AND A REMOUNT IS A LOADING STATE ──
        Reported as "the screen flashes when I click into Milestones", and it is this file's own
        rule broken in a new place: `{group === 'x' && <Panel/>}` tears the whole subtree down on
        every switch, so `Achievements` re-ran `useAchievements` — four decks, the SRS state and
        the IndexedDB shelf — and painted empty before it painted badges. `SrsTab` already
        answers this shape with `TabPanel` for its three drills, and `TabPanel`'s docstring is
        the long version. Groups still mount on FIRST activation only, so a learner who never
        opens Schedule never loads it.
      */}
      <TabPanel active={group === 'overview'}><>
        {/*
          ── AN EMPTY DECK GETS A SENTENCE, NOT A WALL OF ZEROS ────────────────
          CLAUDE.md's reason for `npm run seed:dev` is that the Stats panel hides itself on a
          new account, "because a wall of empty progress bars is a list of things you have
          failed to do". Making this the landing tab would have walked straight into that: a
          first-time learner met by 0 words, 0 days, a 0-day streak and an empty ring. So the
          deckless state is one line and one route, and the route is READING rather than the
          word list — reading is what fills the deck, and sending a beginner to Vocab first
          asks for the boring half before they have seen why it is worth doing.
        */}
        {deckLoaded && deck.length === 0 ? (
          <>
            {/*
              ── AND THE ONE ROUTE OFFERED HERE USED TO BE A DEAD END ────────────
              This said "Start by reading something" with a single button into Read, on the
              reasoning quoted above: reading fills the deck, and sending a beginner to the
              word list first asks for the boring half before they have seen why it is worth
              doing. That argument is still right about Vocab, and it was never checked against
              the screen it points at. `ReadSections` opens on *Generated*, and a generated
              passage is written around the words you owe today — so with an empty deck it
              answers **"Nothing to review yet. A passage here is written around the words you
              have due, so it needs a deck first."**

              The front door, for somebody who had just told the onboarding sheet they were new
              to the language, led to a screen explaining they could not do this yet. Found by
              walking it in a browser, which is this repo's own most-repeated lesson.

              **THE COURSE IS NOT THE WORD LIST, and that is what makes it the right answer.**
              The old sentence weighed reading against Vocab, where "a themed list of nouns"
              really is the boring half. The Learn tab is a third thing: its first lesson hands
              a beginner 26 words AND the grammar that uses them, fills the deck in one tap, and
              leaves them in the state the reading route had assumed they were already in.
              Reading is still offered and still one tap away — it is simply no longer the only
              door, and no longer a door onto a wall.

              Guarded on `hasLessons`, so a language with no tree keeps the old copy rather than
              offering a button into an empty tab.
            */}
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 500, letterSpacing: '-.015em', margin: '0 0 4px', lineHeight: 1.15 }}>
              {courseAvailable ? 'Start at the beginning.' : 'Start by reading something.'}
            </div>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14.5, maxWidth: '46ch', lineHeight: 1.55 }}>
              {courseAvailable
                ? 'The course starts from nothing — a handful of words, then the grammar that uses them. The first lesson puts real words in your deck in one tap. Already read a little? Open something instead.'
                : 'Tap any word you do not know and it joins your deck with a review scheduled. That is the whole loop — there is nothing to set up first.'}
            </p>
            <div className="flex gap-2.5 flex-wrap" style={{ marginTop: 20 }}>
              {courseAvailable && (
                <button
                  onClick={onNavigateLearn}
                  className="cursor-pointer transition-all duration-150"
                  style={{
                    ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)',
                  }}
                >
                  Start the course
                </button>
              )}
              <button
                onClick={onNavigateRead}
                className="cursor-pointer transition-all duration-150"
                style={{
                  ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                  borderRadius: 8, padding: '12px 20px',
                  background: courseAvailable ? 'var(--card)' : 'var(--accent)',
                  color: courseAvailable ? 'var(--ink-soft)' : '#fff',
                  border: courseAvailable ? '1px solid var(--line)' : 'none',
                  boxShadow: courseAvailable ? 'none' : '0 2px 0 var(--accent-deep)',
                }}
              >
                Read something
              </button>
            </div>
          </>
        ) : (<>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 500, letterSpacing: '-.015em', margin: '0 0 4px', lineHeight: 1.15 }}>
          {dueToday === null
            ? <><em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>{deck.length}</em> word{deck.length === 1 ? '' : 's'} in your deck.</>
            : dueToday > 0
              ? <><em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>{dueToday}</em> word{dueToday === 1 ? '' : 's'} due today.</>
              : <>Nothing due today.</>}
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14.5, maxWidth: '46ch', lineHeight: 1.55 }}>
          {dueToday === null
            ? 'Counting what you owe today\u2026'
            : dueToday > 0
              ? `${deck.length} words in your deck. Read a passage built around today\u2019s words, or run them as cards.`
              : `${deck.length} words in your deck, all ahead of schedule. Reading still counts \u2014 and new words come from it.`}
        </p>

        {/*
          TWO ACTIONS, WHICH IS THE WHOLE POINT OF THIS BEING THE HOME.
          The app had three navigation buttons scattered across three content pages, each
          chosen ad hoc: Stats offered "Open today's passage", Vocab offered "Study", and
          nothing anywhere offered Read. One place that answers "what now" replaces all of
          that, and it offers both of the things there are to do rather than whichever one
          the page happened to be about.
        */}
        <div className="flex gap-2.5 flex-wrap" style={{ marginTop: 20 }}>
          <button
            onClick={onNavigateRead}
            className="cursor-pointer transition-all duration-150"
            style={{
              ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
              padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)',
            }}
          >
            Read
          </button>
          <button
            onClick={onNavigateReview}
            className="cursor-pointer transition-all duration-150"
            style={{
              ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
              background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)',
              borderRadius: 8, padding: '12px 20px',
            }}
          >
            {dueToday && dueToday > 0 ? `Review ${dueToday} card${dueToday === 1 ? '' : 's'}` : 'Review cards'}
          </button>
        </div>

        {/*
          ── AND A THIRD, WHICH IS A LINE RATHER THAN A BUTTON ────────────────────
          The comment above says two actions is the whole point, and it is still right that
          three equal buttons is a menu rather than an answer. But the course had the opposite
          problem: Home never mentioned it ONCE, in either state, so an app whose Learn tab
          holds a 50-lesson curriculum pointed every returning learner at reading and reviewing
          and left the course to be rediscovered. That is the same invisibility the empty state
          above was fixed for, one step later in the learner's life.

          So it is a RULE with a sentence on it, not a third primary button: it reports where
          you are and offers the way back in, and reading and reviewing keep the two buttons.
          It disappears once the course is finished, because a 50/50 line is furniture.

          The denominator comes from `LESSON_COUNT` rather than from the lessons themselves —
          this component renders on the landing tab, and importing the tree here would put
          every language's prose in the first bundle. See the note on that constant.
        */}
        {courseAvailable && lessonsDone !== null && courseDone < courseTotal && (
          <button
            onClick={onNavigateLearn}
            className="w-full text-left cursor-pointer transition-all duration-150 rounded-[11px] mt-5 flex items-center gap-3.5"
            style={{ background: 'none', border: '1px solid var(--line)', padding: '12px 15px', color: 'var(--ink)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
          >
            <span className="min-w-0 flex-1">
              <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase',
                color: 'var(--ink-faint)', display: 'block', marginBottom: 2 }}>
                {courseDone === 0 ? 'The course' : 'Carry on with the course'}
              </span>
              <span style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.45, display: 'block' }}>
                {courseDone === 0
                  ? 'A guided path through the language, from your first words up.'
                  : `${courseDone} of ${courseTotal} lessons read.`}
              </span>
            </span>
            {courseDone > 0 && (
              <span aria-hidden className="shrink-0" style={{ width: 54, height: 3, borderRadius: 2,
                background: 'var(--line)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', borderRadius: 2,
                  width: `${Math.round((courseDone / courseTotal) * 100)}%`, background: 'var(--jade)' }} />
              </span>
            )}
            <span aria-hidden style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)' }}>›</span>
          </button>
        )}

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
          {/*
            ── XP, AND IT IS A WEEK RATHER THAN A TOTAL ──────────────────────────
            A lifetime number is a wall somebody new can never climb and somebody old can
            never lose. A week resets, so nobody is permanently behind — the same reasoning
            lib/achievements.ts gives for an unlock only ever ADDING, from the other side.
            It is also the only honest option: see lib/xp.ts on the 400-day prune.

            `null` is "not counted yet" and renders as a dash, not as a zero. Telling a
            learner who has studied all week that they have earned nothing is this file's
            most-repeated bug, and a stat cell is exactly where it would land.
          */}
          <div className="px-5 py-5" style={{ background: 'var(--paper-2)' }}>
            <div style={statLabel}>XP this week</div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 38, fontWeight: 500, letterSpacing: '-.02em', marginTop: 4, lineHeight: 1 }}>
              {xp ? xp.total.toLocaleString() : '—'}
            </div>
            {xp && xp.total > 0 && (
              <div style={statNote}>
                {[
                  xp.cards ? `${xp.cards} card${xp.cards === 1 ? '' : 's'}` : null,
                  xp.passages ? `${xp.passages} passage${xp.passages === 1 ? '' : 's'}` : null,
                  xp.lessons ? `${xp.lessons} lesson${xp.lessons === 1 ? '' : 's'}` : null,
                ].filter(Boolean).join(' · ')}
              </div>
            )}
            {xp && xp.total === 0 && <div style={statNote}>resets Monday</div>}
          </div>

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
          </div>
        </div>

        <MilestoneRing deck={deck} language={language} />
        {/*
          ── THE LOOK-BACK BELONGS IN STATS, AND THE SHELF LEAVING IS THE REASON ───
          The passage shelf and the accuracy trend moved OUT of here and under Read on the
          argument that they describe the passages directly above them. This is the other
          half of that same argument rather than a contradiction of it: this panel's own
          docstring says "the rest of Stats is numbers about the work; this is the work",
          and a year-in-review is numbers about the work. It also spans the decks, the
          lessons and every language at once, which is nothing the Read tab is about.

          It renders NOTHING until there is enough to look back on — see `sparse`. That is
          load-bearing directly above this comment's own warning about a wall of zeros: a
          retrospective of eleven days is the sharpest version of it there is.
        */}
        <YearInReading />
        <PactPanel />
        </>)}
      </></TabPanel>

      <TabPanel active={group === 'milestones'}><Achievements /></TabPanel>

      <TabPanel active={group === 'deck'}><>
        <PieChart deck={deck} />
        <LevelProgress deck={deck} language={language} />
        <WeakWords deck={deck} />
      </></TabPanel>

      <TabPanel active={group === 'schedule'}><>
        <ReviewHeatmap deck={deck} />
        <FutureLoad deck={deck} />
        <RetentionPanel deck={deck} deckLoaded={deckLoaded} />
      </></TabPanel>
    </div>
  );
}
