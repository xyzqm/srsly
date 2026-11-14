'use client';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useBeforePaint } from '@/hooks/useBeforePaint';
import { useLanguage } from '@/lib/LanguageContext';
import { storage } from '@/lib/storage';
import { logLesson } from '@/lib/activityLog';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { type Lesson, loadDone } from '@/lib/lessons';
import { getLanguageConfig } from '@/lib/languageConfig';
import LessonPractice from './LessonPractice';
import WordPopup from '@/components/read/WordPopup';
import { useLessonInspect } from './useLessonInspect';
import { lessonsFor } from '@/lib/data/lessons';
import { unitsFor, nextInCourse, unitProgress, type LessonUnit } from '@/lib/data/lessons/units';
import { BEGINNER_THEMES } from '@/lib/data/beginner-themes';
import { preloadDict, lookupReading } from '@/lib/data/lookup';
import GlossText from '@/components/shared/GlossText';
import { CahierPage, CahierDate, PenMark } from '@/components/shared/Cahier';

/**
 * The lesson tree — a route in for someone who wants one.
 *
 * ORDERED, NEVER LOCKED. Everything here is open on day one. This app's stated position is
 * that levels are calibration and a map rather than the goal, and a tree that gated reading
 * behind lessons would quietly reverse that. Nothing is disabled, nothing is a prerequisite,
 * and the numbers are a suggested path rather than a queue. See lib/lessons.ts.
 *
 * Two kinds of lesson, and they end differently. A grammar lesson is READ, so finishing it is
 * a thing the learner says. A vocabulary lesson is DONE by adding its words, so its button
 * does the work and the tick follows — asking someone to separately confirm they had finished
 * after the words were already in the deck would be a checkbox for its own sake.
 */

interface Props {
  onNavigateSrs?: () => void;
  /** False while the tab is kept alive but hidden — see components/TabPanel.tsx. */
  active?: boolean;
  /**
   * Count today as studied. Resolves to the new streak when this was the day's FIRST study of
   * any kind, and to `undefined` when the day was already counted — which is the difference
   * between "extended" and "kept" on screen, and why the return value is not thrown away.
   */
  onActivity?: () => Promise<number | undefined>;
  /** The streak as it stands, for the day the learner has already been counted for. */
  streak?: number;
}

/**
 * What a completed lesson says about the streak.
 *
 * `day` is where the streak now stands; `extended` is whether this action is what moved it.
 */
interface StreakNote { day: number; extended: boolean }

const MONO: React.CSSProperties = { fontFamily: 'var(--f-mono)', letterSpacing: '.08em' };

export default function LearnTab({ onNavigateSrs, active = true, onActivity, streak = 0 }: Props) {
  const language = useLanguage();
  const { deck, addWords, addWord } = useVocabDeck(language);
  const all = useMemo(() => lessonsFor(language), [language]);

  const [done, setDone] = useState<Set<string>>(() => new Set());
  /** Whether `done` is an answer yet, or still just its empty starting value. */
  const [doneLoaded, setDoneLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Read in an effect, not in useState's initialiser, so the server render and the first
  // client render agree — otherwise React hydration mismatches on the ticks. Through
  // `storage` rather than localStorage directly, so a signed-in learner picks up lessons
  // they finished on another device instead of being sent back through the tree.
  //
  // `doneLoaded` is set either way, including on failure: a rejected read leaves `done`
  // empty, which is a poor answer but IS the answer, and never flipping the flag would hide
  // the "start here" marker for the rest of the session.
  useEffect(() => {
    let live = true;
    storage.getLessonsDone()
      .then(ids => { if (live) setDone(new Set(ids)); })
      .catch(() => {})
      .finally(() => { if (live) setDoneLoaded(true); });
    return () => { live = false; };
  }, []);

  /**
   * ── SEEDED FROM THE LOCAL COPY BEFORE THE FIRST PAINT, WHICH IS WHAT STOPS THE JUMP ──
   *
   * `openUnit` is `null` until `doneLoaded`, so the path first rendered with every unit SHUT
   * and then expanded one of them when storage answered. Measured at phone width with a real
   * deck: the units below the one that opened moved **252px down**, and two of them left the
   * viewport entirely. CLAUDE.md recorded this as a known residual and said closing it needed
   * "either a synchronous probe on the storage facade — a real interface change — or giving up
   * auto-expanding the current unit, which is a product decision", and that neither had been
   * taken unasked.
   *
   * Neither is needed. **`loadDone()` already IS that synchronous probe**: it is a plain
   * `localStorage` read in `lib/lessons.ts`, and `SupabaseStorage.getLessonsDone` writes its
   * cloud answer back through `this.local.saveLessonsDone`, so a signed-in learner's cache sits
   * under the same key. The asynchronous read above is still the authority and still runs; this
   * only moves the COMMON answer early enough to be in the first frame.
   *
   * It is a LAYOUT effect, which is the whole point — it commits before the browser paints, so
   * the correct unit is already open in the first frame the learner sees rather than one frame
   * later. As a passive effect this would paint shut and then expand, which is the bug.
   *
   * ── IT IS NOT READ IN A `useState` INITIALISER, AND THAT IS THE HYDRATION RULE ──
   * The effect above says why: this page is prerendered, `localStorage` does not exist there,
   * and a value read during render differs between the server tree and the client's first pass.
   * A layout effect runs only on the client and only after hydration has committed, so it gets
   * the pre-paint guarantee without the mismatch.
   *
   * ── AN EMPTY CACHE IS SEEDED TOO, DELIBERATELY ──
   * A brand-new learner genuinely has nothing finished, so `[]` is the right answer and opens
   * unit 1 — in the first frame, with no shift. The case this cannot fix is a signed-in learner
   * on a device whose cache is cold: they briefly see unit 1 before the cloud moves them to
   * their real place. That is one shift, which is exactly what they get today, so nobody is
   * worse off and everybody with a warm cache is better off.
   */
  useBeforePaint(() => {
    const cached = loadDone();
    setDone(cached);
    setDoneLoaded(true);
  }, []);

  // Opening a lesson while a different language is selected would show French lessons under
  // a Chinese deck; switching closes whatever was open, as EpubPanel does with its book.
  useEffect(() => { setOpenId(null); }, [language]);
  // The note belongs to the lesson that earned it; opening another must not inherit it.
  useEffect(() => { setStreakNote(null); }, [openId]);

  const [streakNote, setStreakNote] = useState<StreakNote | null>(null);

  /**
   * Count today as studied, and report where that leaves the streak.
   *
   * Only ever called when a lesson is being FINISHED. Un-ticking one must not count a day —
   * and more importantly must not UNCOUNT it, which nothing here could do anyway: the streak
   * records that you studied, and reading a lesson and then changing your mind about the tick
   * does not unmake the reading.
   */
  const countToday = useCallback(async () => {
    if (!onActivity) return;
    const extendedTo = await onActivity();
    setStreakNote({ day: extendedTo ?? streak, extended: extendedTo !== undefined });
  }, [onActivity, streak]);

  /**
   * ⚠ EVERY SIDE EFFECT HERE IS OUTSIDE THE `setDone` UPDATER, AND ONE CLICK PROVED WHY.
   *
   * This used to do its work inside `setDone(prev => …)`. React treats a state updater as a
   * PURE function and calls it twice under StrictMode to prove it is one — so a single click
   * on "Add 25 words" wrote `{"d":"2026-10-18","n":0,"l":2}`: two lessons logged for one
   * lesson finished, and a weekly XP total inflated by a factor of two.
   *
   * It was invisible before XP existed, because the two effects already in there were
   * idempotent: `saveLessonsDone` writes the same array twice and `countToday` is guarded by
   * `recordActivity`'s own "already counted today". `logLesson` ACCUMULATES, so it was the
   * first one that could show the double — found by reading localStorage after a single
   * click rather than by reading this function.
   *
   * CLAUDE.md records the same hazard from the other side: `lib/completionSurface.ts` is a
   * Set keyed by instance "so that StrictMode's double render is a no-op instead of a
   * permanent +1".
   */
  const mark = useCallback((id: string) => {
    const finishing = !done.has(id);
    const next = new Set(done);
    if (finishing) next.add(id); else next.delete(id);
    setDone(next);
    void storage.saveLessonsDone([...next]);
    if (finishing) {
      // A DATE for something that otherwise has none: `srsly-lessons-done` is a flat list of
      // ids, so without this a finished lesson could never appear in a weekly total. See
      // `DayActivity.l`. Separate from `countToday`, which is about the streak and fires only
      // on the day's FIRST study, where this has to count every lesson.
      logLesson();
      void countToday();
    }
  }, [done, countToday]);

  const open = all.find(l => l.id === openId) ?? null;
  const units = useMemo(() => unitsFor(language), [language]);
  const byId = useMemo(() => new Map(all.map(l => [l.id, l])), [all]);
  /**
   * NOT UNTIL WE KNOW. `done` is an empty Set until storage answers, and "the next lesson"
   * computed from an empty set is always lesson ONE — so the marker painted itself on the
   * first lesson and then jumped down to the real one a moment later, which reads as the
   * tree changing its mind about where you are.
   *
   * Same mistake as the passage skeleton and the empty-deck copy, in a third place: a value
   * meaning "not loaded yet" rendered as a value meaning "you have finished nothing". The
   * marker simply appears once, on the right lesson — and `doneLoaded` travels down with it,
   * because the Continue card and every unit's progress count have exactly the same problem.
   */
  const next = doneLoaded ? nextInCourse(units, done) : null;

  if (!all.length) return null;

  return (
    /* A page of the exercise book, ruled in this language's school paper — see
       components/shared/Cahier.tsx. The course list AND an open lesson both sit on it. */
    <CahierPage
      className="rounded-tr-xl rounded-b-xl animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
      <CahierDate />
      {open
        ? <LessonView
            lesson={open}
            done={done.has(open.id)}
            deck={deck}
            addWords={addWords}
            addWord={addWord}
            onMark={() => mark(open.id)}
            onBack={() => setOpenId(null)}
            onNavigateSrs={onNavigateSrs}
            active={active}
            streakNote={streakNote}
          />
        /* `key` resets which unit is expanded when the language changes. Without it the
           picked id belongs to the previous course, matches no unit in the new one, and the
           whole path renders collapsed — which is what the old `touched` flag also did, and
           is a worse first impression of a tree than opening where you are. */
        : <CoursePath key={language} units={units} byId={byId} done={done} doneLoaded={doneLoaded}
            next={next} onOpen={setOpenId} />}
    </CahierPage>
  );
}

/**
 * ONE PATH, CUT INTO UNITS — and it replaced two flat lists.
 *
 * The tab used to render a numbered grammar track and, 29 rows below it, a pile of word sets
 * "in no particular order". That reasoning is written out in `lib/lessons.ts` and is not wrong
 * about the thing it was arguing — grammar builds on itself and vocabulary does not. It was
 * wrong about the screen: **50 identical rows, 3,853 pixels tall**, opening on an abstract rule
 * for somebody who had just said they were new to the language, under a paragraph explaining
 * that the order was only a suggestion.
 *
 * Three things changed and each answers a specific complaint:
 *
 * - **A UNIT IS SOMETHING YOU CAN FINISH.** 50 rows have no end in them. Four or five do, which
 *   is the only reason a progress bar is worth drawing — see `lib/data/lessons/units.ts`.
 * - **UNITS COLLAPSE, so the course is 11 rows rather than 50.** The one you are on opens
 *   itself. A table of contents you can see the whole of is a different object from a list you
 *   scroll for five screens.
 * - **CONTINUE IS THE FIRST THING ON THE PAGE.** The old tree answered "where am I" with a
 *   `start here` tag eleven rows down, which the reader had to go and find. A course that makes
 *   you choose where to start every time you open it is one you open less.
 *
 * NUMBERED, STILL NEVER LOCKED. Nothing is `disabled`, no unit gates another, and every lesson
 * opens on day one — the position `lib/lessons.ts` states and this screen must not quietly
 * reverse. The numbers say where you are, never where you are allowed.
 *
 * NO MASCOT, AND THAT IS A DELIBERATE REFUSAL. The obvious reference here draws a winding path
 * of cartoon nodes. CLAUDE.md already settled the register question when the header's drawn
 * face was removed: a mascot "reads as a mascot on a page otherwise set like a book". So this
 * is shaped as a book's contents — numbered units, a rule of progress, prose that promises what
 * you will be able to do — which is the same motivation in this app's own voice.
 */
function CoursePath({ units, byId, done, doneLoaded, next, onOpen }: {
  units: LessonUnit[];
  byId: Map<string, Lesson>;
  done: Set<string>;
  doneLoaded: boolean;
  next: ReturnType<typeof nextInCourse>;
  onOpen: (id: string) => void;
}) {
  /**
   * Which unit is expanded. The one you are on, once we know which that is.
   *
   * ── DERIVED, NOT SET IN AN EFFECT, AND THAT IS A FIX RATHER THAN A TIDY-UP ──
   * The three states are real and the old `useState` + `touched` pair had them right:
   * "not chosen yet" is NOT "none open", the mistake this repo names four times over.
   * What it got wrong is WHEN. An effect runs after the commit that paints, so the order
   * was: storage answers → render with every unit shut → **paint** → effect → render again
   * with one open. The docstring predicted the symptom exactly — "a returning learner would
   * watch the course open itself a beat after it rendered shut" — and the implementation
   * then did it. Measured at phone width, that second commit was a 0.23 layout shift, the
   * largest single one in the app.
   *
   * Deriving it puts the open unit in the SAME commit as `doneLoaded`, so there is nothing
   * to see. `undefined` carries "not chosen yet" and `null` carries "the learner collapsed
   * them all", which is what `touched` was for — one value now holds both facts, so they
   * cannot disagree.
   */
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const openUnit = picked !== undefined
    ? picked
    : doneLoaded ? (next ? next.unit.id : units[0]?.id ?? null) : null;

  const totalDone = doneLoaded ? units.reduce((n, u) => n + unitProgress(u, done).done, 0) : 0;
  const total = units.reduce((n, u) => n + u.lessons.length, 0);
  const nextLesson = next ? byId.get(next.lessonId) : undefined;

  return (
    <>
      {/* ── THE PAGE'S TITLE, RULED OFF TWICE IN PEN ──
          Flush left in the display face over a double underline, with the count pencilled at
          the end of the line. It went from a 10px mono eyebrow to a serif heading over a 2px
          rule last round; the double underline is the same heading in the notebook's own
          hand, and it is what a pupil actually does to a title. */}
      <div className="flex items-end justify-between gap-3 mt-2">
        <h2 className="cahier-title">The course</h2>
        <div className="cahier-hand" style={{ fontSize: 13, color: 'var(--ink-soft)', paddingBottom: 4, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {doneLoaded ? `${totalDone} / ${total}` : `${total} lessons`}
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0', lineHeight: 1.4 }}>
        {units.length} units · nothing is locked
      </p>

      {/*
        ── THE CONTINUE NOTE ────────────────────────────────────────────────────
        One control, naming one lesson — a sticky note on the page rather than a bordered
        accent card. `--cahier-sticky` is the theme's own `--gold` laid over `--card`, so it is
        a warm slip on the light papers and a dim one on the dark, and the text on it is the
        theme's ink either way.

        `.cahier-sheet` tilts the PAPER and leaves the content level, so the note looks stuck
        on by hand and the lesson's name is still sharp.

        EVERYTHING ON THE NOTE IS SET IN `--ink`, NOT `--ink-soft`. The note is a tinted
        surface, and grey on a tint is where contrast goes to die: `tests/cahier.test.ts`
        measured the soft ink on it at 4.39:1 on vellum, 4.43 on midnight and 4.50 on dusk —
        three themes a hair under the line, none of which anybody would have opened to check.
        Hierarchy on the note comes from size and weight instead.
      */}
      <div
        className="cahier-sheet flex flex-col items-start gap-4 sm:flex-row sm:items-center"
        style={{ '--sheet-bg': 'var(--cahier-sticky)', '--sheet-tilt': '.9deg', padding: '14px 16px 16px', margin: '20px 4px 24px 0' } as CSSProperties}
      >
        {!doneLoaded ? (
          /*
            ── THE PLACEHOLDER IS THE NOTE'S SHAPE, NOT A NUMBER ──
            Each row carries the REAL row's typography and a non-breaking space, so it is
            exactly as tall as the loaded note in every theme, font and width — a pixel height
            measured on a desktop was 65px short on a phone, where the button wraps below the
            text. `LearnTab` now seeds `done` before the first paint, so this is seen only when
            that cannot answer; the rows below must still be kept in step with the ones in the
            loaded branch.
          */
          <>
            <div className="min-w-0 flex-1 w-full" aria-hidden>
              <div className="shimmer" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', lineHeight: 1.4,
                marginBottom: 4, width: 120, borderRadius: 4, color: 'transparent' }}>&nbsp;</div>
              <div className="shimmer" style={{ fontFamily: 'var(--f-display)', fontSize: 21, fontWeight: 600,
                lineHeight: 1.2, width: '72%', borderRadius: 5, color: 'transparent' }}>&nbsp;</div>
              {/* The same 2.8em two-line box the real summary occupies. */}
              <div style={{ marginTop: 4, fontSize: 13.5, lineHeight: 1.4, height: '2.8em' }}>
                <div className="shimmer" style={{ height: '1.2em', width: '96%', borderRadius: 4 }} />
                <div className="shimmer" style={{ height: '1.2em', width: '55%', borderRadius: 4, marginTop: '0.3em' }} />
              </div>
            </div>
            {/* The real button's box (`.cahier-btn`), so it wraps at the same width. */}
            <div className="shimmer shrink-0" aria-hidden
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 48, padding: '0 26px', borderRadius: 6,
                fontFamily: 'var(--f-ui)', fontSize: 15.5, fontWeight: 600, color: 'transparent' }}>
              Continue
            </div>
          </>
        ) : next && nextLesson ? (
          <>
            <div className="min-w-0 flex-1">
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', lineHeight: 1.4, color: 'var(--ink)', marginBottom: 4 }}>
                {totalDone === 0 ? 'Start here' : 'Up next'} · Unit {next.index + 1}
              </div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 21, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>
                {nextLesson.title}
              </div>
              {/* A FIXED TWO-LINE BOX, which is what makes this note one height whatever the
                  lesson says. Clamped rather than merely reserved, so a long summary cannot
                  grow it either. */}
              <div style={{ fontSize: 13.5, color: 'var(--ink)', marginTop: 4,
                lineHeight: 1.4, height: '2.8em', overflow: 'hidden',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {nextLesson.summary}
              </div>
            </div>
            <button onClick={() => onOpen(next.lessonId)} className="cahier-btn shrink-0">
              {totalDone === 0 ? 'Begin' : 'Continue'}
            </button>
          </>
        ) : (
          /* FINISHING THE COURSE IS A REAL STATE and gets a real sentence, not an empty note.
             It also must not read as the end of the app: the course was always the way in to
             reading, never the destination. */
          <div className="min-w-0">
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 21, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>
              You have been through the whole course.
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink)', marginTop: 4, lineHeight: 1.45 }}>
              Every unit is read. Re-open any of them whenever a rule stops being obvious —
              and keep reading, which is where the rest of the language is.
            </div>
          </div>
        )}
      </div>

      {/* NO `gap` and no rules between rows: the page's own ruling is the separator now, and a
          second set of hairlines over a ruled sheet is two grids arguing. */}
      <div className="flex flex-col">
        {units.map((u, i) => (
          <UnitBlock
            key={u.id}
            unit={u}
            n={i + 1}
            byId={byId}
            done={done}
            doneLoaded={doneLoaded}
            nextId={next?.lessonId}
            current={next?.unit.id === u.id}
            open={openUnit === u.id}
            onToggle={() => setPicked(openUnit === u.id ? null : u.id)}
            onOpen={onOpen}
          />
        ))}
      </div>
    </>
  );
}

/**
 * One unit: a line in the notebook's contents, and its lessons as a checklist when open.
 *
 * ── THE MARGIN CARRIES THE STATE, WHICH IS WHAT A MARGIN IS FOR ──
 * Left of the rule sits the unit's number; a finished unit has a pen tick there instead, and
 * the unit you are on has its number CIRCLED. So the three states are one glance down a single
 * column, and the titles to the right of the rule are never interrupted by a badge.
 *
 *   finished   tick in the margin · title in `--ink-soft` · blurb dropped (a receipt, not a pitch)
 *   current    circled number · title in the display face under a HIGHLIGHTER stroke
 *   upcoming   number · bold title · blurb clamped to two lines
 *
 * ── `current` AND `open` ARE TWO DIFFERENT FACTS, AND THEY USED TO BE ONE ──
 * Last round the OPEN unit was the elevated card, so opening unit 7 to look ahead moved the
 * emphasis there and the list stopped saying where you were. `current` is the unit holding the
 * next unfinished lesson and is where the highlighter and the circle go; `open` is only which
 * checklist is showing. Nothing here is locked — every unit opens — so they diverge the moment
 * a learner browses, which is exactly when "where am I" matters.
 *
 * ── A ROW IS A CLASS (`.cahier-row`), FOR THE KEYBOARD ──
 * The lesson rows used inline `onMouseEnter`/`onMouseLeave` writing `style.background`, which
 * cannot express `:focus-visible`: a keyboard user tabbing the course saw nothing move. Unit
 * rows and lesson rows now share one class with hover, press and a focus ring.
 *
 * There is no left-edge accent stripe any more. It was added last round to mark the open unit
 * and is one of the stock devices that made the page read as machine-made.
 */
function UnitBlock({ unit, n, byId, done, doneLoaded, nextId, current, open, onToggle, onOpen }: {
  unit: LessonUnit;
  n: number;
  byId: Map<string, Lesson>;
  done: Set<string>;
  doneLoaded: boolean;
  nextId?: string;
  /** Holds the next unfinished lesson — where the learner IS, whichever unit is open. */
  current: boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
}) {
  const { done: d, total } = unitProgress(unit, done);
  const complete = doneLoaded && d === total;

  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="cahier-row w-full flex items-start gap-3"
        style={{ position: 'relative', minHeight: 48, padding: '10px 6px', marginLeft: -6, width: 'calc(100% + 6px)', '--gutter-shift': '6px' } as CSSProperties}
      >
        <span className="cahier-gutter" aria-hidden="true" style={{ top: 7, height: 30, alignItems: 'center' }}>
          {complete ? (
            <span style={{ color: 'var(--cahier-pen)', display: 'flex' }}><PenMark kind="tick" size={24} /></span>
          ) : current ? (
            <span style={{ position: 'relative', width: 29, height: 29, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cahier-pen)' }}>
              <span style={{ position: 'absolute', inset: 0, display: 'flex' }}><PenMark kind="circle" size={29} strokeWidth={4} /></span>
              <span style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 16, fontWeight: 600, color: 'var(--cahier-pen-strong)' }}>{n}</span>
            </span>
          ) : (
            <span style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 19, color: 'var(--ink-soft)', paddingRight: 3 }}>{n}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          {current ? (
            <span style={{ display: 'block', fontFamily: 'var(--f-display)', fontSize: 19.5, fontWeight: 600, letterSpacing: '-.01em', lineHeight: 1.3, color: 'var(--ink)' }}>
              <span className="cahier-hilite">{unit.title}</span>
            </span>
          ) : (
            <span style={{ display: 'block', fontSize: 15.5, fontWeight: complete ? 500 : 600, lineHeight: 1.3, color: complete ? 'var(--ink-soft)' : 'var(--ink)' }}>
              {unit.title}
            </span>
          )}
          {/* Dropped once the unit is finished: a blurb sells a unit you have not opened. */}
          {!complete && (
            <span style={current
              ? { display: 'block', fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.45 }
              : { fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.4, overflow: 'hidden',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {unit.blurb}
            </span>
          )}
        </span>
        {/* The ticks carry the number, so they are hidden from a screen reader and the count
            beside them is what is announced. */}
        <span className="shrink-0 flex items-center gap-2" style={{ paddingTop: 3 }}>
          {doneLoaded && (
            <span aria-hidden className="hidden sm:flex gap-[3px]">
              {unit.lessons.map((id, i) => (
                <span key={i} style={{ width: 13, height: 3, borderRadius: 2,
                  background: done.has(id) ? 'var(--cahier-pen)' : 'color-mix(in srgb, var(--ink) 16%, transparent)' }} />
              ))}
            </span>
          )}
          <span style={{ fontSize: 12.5, color: 'var(--ink-soft)', minWidth: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {doneLoaded ? `${d}/${total}` : `${total}`}
          </span>
          <span aria-hidden style={{ fontSize: 13, color: 'var(--ink-soft)',
            transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
        </span>
      </button>

      {open && (
        /* THE LESSONS, AS THE CHECKLIST A PUPIL KEEPS: a box per lesson, ticked in pen when
           it is read. The box is the same `.cahier-box` the flashcard's toggles use. */
        <div className="flex flex-col" style={{ paddingBottom: 6 }}>
          {unit.lessons.map(id => {
            const l = byId.get(id);
            if (!l) return null;   // a test makes this unreachable; rendering nothing beats throwing
            const isDone = done.has(id);
            const isNext = nextId === id;
            return (
              <button
                key={id}
                onClick={() => onOpen(id)}
                className="cahier-row flex items-center gap-2.5"
                style={{ minHeight: 46, padding: '5px 6px', marginLeft: -6, width: 'calc(100% + 6px)' }}
              >
                <span className="cahier-box" aria-hidden="true">{isDone && <PenMark kind="tick" size={22} />}</span>
                <span className="min-w-0 flex-1">
                  <span style={{ fontSize: 14.5, display: 'block', lineHeight: 1.3, fontWeight: isNext ? 700 : 400, color: isDone ? 'var(--ink-soft)' : 'var(--ink)' }}>{l.title}</span>
                  {isNext ? (
                    /* In the pen, in the margin hand — and in `--cahier-pen-strong`, not the
                       pen itself: at this size it is text, and needs 4.5:1 on every paper. */
                    <span className="cahier-hand" style={{ fontSize: 11.5, color: 'var(--cahier-pen-strong)', display: 'block', marginTop: 1 }}>
                      ← you are here
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'block', marginTop: 1, lineHeight: 1.4 }}>
                      {l.summary}
                    </span>
                  )}
                </span>
                {/* WHICH KIND, said in a word rather than inferred from a glyph. The two end
                    differently — a grammar lesson is read and ticked, a word set is finished by
                    adding its words — so the reader is told which one they are opening. */}
                <span style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 12.5, flexShrink: 0, color: 'var(--ink-soft)' }}>
                  {l.kind === 'vocab' ? 'words' : 'grammar'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


/**
 * THE STREAK, SAID OUT LOUD AT THE MOMENT IT MOVES.
 *
 * A streak that is only ever visible on another tab is a number, not a motivation. It is shown
 * here because this is where the day was earned, and immediately, because the gap between
 * doing the thing and being told it counted is the whole of the feeling.
 *
 * ── IT DISTINGUISHES EXTENDED FROM KEPT, AND THAT IS NOT PEDANTRY ──
 * `recordActivity` counts a day once. Finish a second lesson and the streak does not move —
 * so announcing "day 4" twice would be the app claiming credit it did not give, and a learner
 * who noticed would stop believing the number. The second one says the day is already counted,
 * which is a real and reassuring thing to be told.
 *
 * No flame, and no emoji anywhere near it: `Mark.tsx` and `BadgeSeal` both refuse emoji for
 * the same reason, that it is somebody else's artwork drawn differently on every OS, arriving
 * in full colour into a palette assembled from ten themes.
 */
function StreakBanner({ note }: { note: StreakNote }) {
  return (
    <div
      className="mt-4 rounded-[11px] px-4 py-3 flex items-baseline gap-3 animate-rise"
      style={{ background: 'var(--jade-soft)', border: '1px solid var(--jade)' }}
      role="status"
    >
      <span style={{ fontFamily: 'var(--f-display)', fontSize: 23, lineHeight: 1, color: 'var(--jade)' }}>
        {note.day}
      </span>
      <span className="min-w-0">
        <span style={{ ...MONO, fontSize: 9.5, textTransform: 'uppercase', color: 'var(--jade)',
          display: 'block', letterSpacing: '.14em' }}>
          {note.extended ? 'Day streak \u2014 extended' : 'Day streak \u2014 today already counted'}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)', display: 'block', marginTop: 2 }}>
          {note.extended
            ? 'Finishing a lesson counts as studying, the same as reviewing cards.'
            : 'You had already studied today, so the streak stays where it is.'}
        </span>
      </span>
    </div>
  );
}

function LessonView({ lesson, done, deck, addWords, addWord, onMark, onBack, onNavigateSrs, active, streakNote }: {
  lesson: Lesson;
  done: boolean;
  deck: { h: string }[];
  addWords: (w: { h: string; p: string; m: string }[]) => Promise<number>;
  addWord: (w: { h: string; p: string; m: string }) => Promise<void>;
  onMark: () => void;
  onBack: () => void;
  onNavigateSrs?: () => void;
  active: boolean;
  streakNote: StreakNote | null;
}) {
  return (
    <>
      <button
        onClick={onBack}
        className="cursor-pointer mb-5"
        style={{ ...MONO, fontSize: 10, background: 'none', border: 'none', color: 'var(--ink-faint)', padding: 0 }}
      >
        ‹ all lessons
      </button>

      <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 25, margin: '0 0 4px', color: 'var(--ink)' }}>
        {lesson.title}
      </h2>
      <div style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 22 }}>{lesson.summary}</div>

      {lesson.kind === 'vocab'
        ? <VocabLesson lesson={lesson} done={done} deck={deck} addWords={addWords} onMark={onMark} onNavigateSrs={onNavigateSrs} active={active} streakNote={streakNote} />
        : <GrammarLesson lesson={lesson} done={done} onMark={onMark} addWord={addWord} streakNote={streakNote} />}
    </>
  );
}

function GrammarLesson({ lesson, done, onMark, addWord, streakNote }: {
  lesson: Lesson; done: boolean; onMark: () => void;
  addWord: (w: { h: string; p: string; m: string }) => Promise<void>;
  streakNote: StreakNote | null;
}) {
  const language = useLanguage();
  const unspaced = getLanguageConfig(language).scriptIsUnspaced;
  const [practicing, setPracticing] = useState(false);
  const { popup, setPopup, inspect } = useLessonInspect(language);

  // The examples are tappable, so the dictionary has to be here before the first tap —
  // the vocab lessons already preload it for their word lists, grammar lessons did not.
  useEffect(() => { void preloadDict(language); }, [language]);

  // Blank lines are paragraph breaks; single newlines are just the source file wrapping.
  const paras = (lesson.explanation ?? '').trim().split(/\n\s*\n/);
  // A single fused token cannot be reassembled — 待ってください。is one word — so it stays an
  // example and is not offered as a puzzle. Purpose-written practice sentences count too, and
  // are what the run will actually use — see lib/lessonPractice.ts.
  const buildable = (l?: { tiles?: string[] }[]) => (l ?? []).filter(e => (e.tiles?.length ?? 0) > 1);
  const practice = buildable(lesson.practice).length ? buildable(lesson.practice) : buildable(lesson.examples);

  // The session takes over the lesson view rather than sitting under it: a progress bar with
  // the explanation still scrolling above it is two things competing for the same attention.
  if (practicing) {
    return (
      <LessonPractice
        lesson={lesson}
        language={language}
        unspaced={unspaced}
        onAddVocab={(h, p, m) => { void addWord({ h, p, m }); }}
        onExit={() => setPracticing(false)}
      />
    );
  }

  return (
    <>
      <div style={{ maxWidth: 620 }}>
        {paras.map((p, i) => (
          <p key={i} style={{ fontSize: 14.5, lineHeight: 1.72, color: 'var(--ink)', margin: '0 0 15px' }}>
            {p.replace(/\n/g, ' ')}
          </p>
        ))}
      </div>

      {lesson.table && <ReferenceTable table={lesson.table} unspaced={unspaced} onInspect={inspect} />}

      {lesson.pitfall && (
        /* THE ERROR GETS ITS OWN BOX. A rule stated correctly and a rule stated correctly
           beside the wrong version you were about to write are not the same lesson — the
           second one is the one a reader recognises later, at speed, in their own sentence. */
        <div className="mt-6 rounded-[12px] px-4 py-3.5" style={{ maxWidth: 620,
          background: 'var(--gold-soft)', border: '1px solid var(--gold)' }}>
          <div style={{ ...MONO, fontSize: 9.5, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 5 }}>
            Watch out
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.65 }}>{lesson.pitfall}</div>
        </div>
      )}

      {!!lesson.examples?.length && (
        <div className="mt-7">
          <div style={{ ...MONO, fontSize: 9.5, textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
            Examples
          </div>
          <div className="flex flex-col gap-3" style={{ maxWidth: 620 }}>
            {lesson.examples.map((ex, i) => (
              <div key={i} style={{ borderLeft: '2px solid var(--line)', paddingLeft: 13 }}>
                {/* TAPPABLE, for the same reason every word in the Read tab is. A lesson can
                    print 个 and 张 and never say how either is pronounced — the examples were
                    the one place in the app showing Chinese you could not tap to look up.
                    `tiles` already holds this sentence cut on real segmenter boundaries, so
                    the words are there to be made tappable; an example without them falls
                    back to plain text rather than guessing at where words start. */}
                <div style={{ fontSize: 15.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                  {ex.tiles?.length
                    ? ex.tiles.map((t, ti) => (
                        <button
                          key={ti}
                          onClick={e => inspect(t, e.currentTarget)}
                          /* An example word's ONLY job is to explain itself, so every gesture
                             in lib/inspectGesture.ts already lands here. The context menu is
                             suppressed so a right-click gets the definition rather than the
                             browser's own menu, which is what it gets on a practice tile. */
                          onContextMenu={e => { e.preventDefault(); inspect(t, e.currentTarget); }}
                          className="cursor-pointer"
                          /* The gap between words is a MARGIN, not a space in the label. A
                             button is inline-block and browsers trim trailing whitespace
                             inside one, so `${t} ` collapsed to nothing and every French and
                             Spanish example rendered as «jesuisfatigué.» — one unreadable run.
                             Chinese and Japanese want no gap at all, which is the same rule
                             with a width of zero. */
                          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit',
                            color: 'inherit', borderBottom: '1px dotted var(--line)',
                            marginRight: unspaced ? 0 : '0.28em' }}
                        >
                          {t}
                        </button>
                      ))
                    : ex.text}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 2, lineHeight: 1.5 }}>{ex.gloss}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRACTICE, and it grades nothing. Getting one wrong costs nothing and schedules
          nothing — the curriculum is separate from FSRS, and a lesson you can fail is a lesson
          you avoid. It is a RUN now rather than a page of exercises: see
          components/learn/LessonPractice.tsx for why one-at-a-time earns the change. */}
      {practice.length > 0 && (
        <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--line)', maxWidth: 620 }}>
          <div style={{ ...MONO, fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Practice
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: '4px 0 12px', lineHeight: 1.5 }}>
            A short run of questions on this lesson. Nothing is graded and nothing is
            scheduled — the ones you miss simply come back at the end.
          </p>
          <button
            onClick={() => setPracticing(true)}
            className="cursor-pointer rounded-lg transition-all duration-150"
            style={{ ...MONO, fontSize: 11, padding: '12px 20px', fontWeight: 600,
              background: 'var(--accent)', border: 'none', color: '#fff' }}
          >
            Start practice
          </button>
        </div>
      )}

      <div className="mt-8 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
        <button
          onClick={onMark}
          className="cursor-pointer rounded-lg transition-all duration-150"
          style={{
            ...MONO, fontSize: 10.5, padding: '9px 15px', fontWeight: 600,
            background: done ? 'none' : 'var(--jade)',
            border: done ? '1px solid var(--line)' : 'none',
            color: done ? 'var(--ink-faint)' : '#fff',
          }}
        >
          {done ? '✓ Done — mark unread' : 'Mark as done'}
        </button>
        {/* Only while the lesson is still ticked — un-ticking it should not leave a banner
            congratulating the learner for a lesson they have just un-finished. */}
        {done && streakNote && <StreakBanner note={streakNote} />}
      </div>

      <WordPopup data={popup} onClose={() => setPopup(null)}
        onAddVocab={(h, p, m) => { void addWord({ h, p, m }); setPopup(null); }} />
    </>
  );
}

/**
 * The enumerable half of a rule, laid out.
 *
 * The first column is target-language and every cell in it is a BUTTON, for the same reason
 * every word in a passage is: a lesson can print 个 and 张 and never say how either is
 * pronounced. That is also why the table is structured data rather than markdown inside
 * `explanation` — a string cannot be tapped.
 *
 * It scrolls inside its own box rather than widening the page. A three-column reference is
 * comfortable at 620px and impossible at 375, and a lesson body that scrolls sideways is a
 * worse bug than a table that does.
 */
function ReferenceTable({ table, unspaced, onInspect }: {
  table: NonNullable<Lesson['table']>;
  unspaced: boolean;
  onInspect: (term: string, el: HTMLElement) => void;
}) {
  const cell: React.CSSProperties = {
    padding: '7px 12px 7px 0', textAlign: 'left', verticalAlign: 'top',
    borderBottom: '1px solid var(--line)', lineHeight: 1.5,
  };
  return (
    <div className="mt-7" style={{ maxWidth: 620 }}>
      <div style={{ ...MONO, fontSize: 9.5, textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
        {table.caption}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 320 }}>
          <thead>
            <tr>
              {table.columns.map(c => (
                <th key={c} style={{ ...cell, ...MONO, fontSize: 9.5, textTransform: 'uppercase',
                  color: 'var(--ink-faint)', fontWeight: 500, borderBottomColor: 'var(--ink-faint)' }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} style={{ ...cell, fontSize: j === 0 ? 15 : 13,
                    color: j === 0 ? 'var(--ink)' : 'var(--ink-soft)',
                    whiteSpace: j === 0 ? 'nowrap' : undefined }}>
                    {j === 0 && c
                      /* Tapped WORD BY WORD, not cell by cell. A conjugation row reads
                         "je suis", and neither the dictionary nor the deinflection route can
                         resolve a two-word phrase — so a whole-cell button was dead on every
                         row of every French and Spanish table. Splitting on spaces is a no-op
                         for the single characters Chinese and Japanese put here. */
                      ? c.split(' ').map((w, k) => (
                          <button
                            key={k}
                            onClick={e => onInspect(w, e.currentTarget)}
                            onContextMenu={e => { e.preventDefault(); onInspect(w, e.currentTarget); }}
                            className="cursor-pointer"
                            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit',
                              color: 'inherit', borderBottom: '1px dotted var(--line)',
                              marginRight: k < c.split(' ').length - 1 ? '0.28em' : 0,
                              fontFamily: unspaced ? 'var(--f-han)' : undefined }}
                          >
                            {w}
                          </button>
                        ))
                      : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VocabLesson({ lesson, done, deck, addWords, onMark, onNavigateSrs, active, streakNote }: {
  lesson: Lesson;
  done: boolean;
  deck: { h: string }[];
  addWords: (w: { h: string; p: string; m: string }[]) => Promise<number>;
  onMark: () => void;
  onNavigateSrs?: () => void;
  active: boolean;
  streakNote: StreakNote | null;
}) {
  const language = useLanguage();
  const [entries, setEntries] = useState<{ h: string; p: string; m: string }[] | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const words = useMemo(() => {
    const byLang = (BEGINNER_THEMES as Record<string, Record<string, string[]>>)[language] ?? {};
    return lesson.theme ? byLang[lesson.theme] ?? [] : [];
  }, [language, lesson.theme]);

  /**
   * Glosses are resolved from the dictionary the client already fetches, never shipped with
   * the lesson — see scripts/build-themes.mjs. That means waiting for the same preload the
   * reader waits for, which is why this renders a loading line rather than an empty list.
   */
  useEffect(() => {
    let live = true;
    if (!active || !words.length) return;
    setEntries(null);
    void preloadDict(language).then(() => {
      if (!live) return;
      setEntries(words.map(w => {
        const e = lookupReading(language, w);
        return { h: w, p: e.reading, m: e.meaning };
      }));
    });
    return () => { live = false; };
  }, [language, words, active]);

  const inDeck = useMemo(() => new Set(deck.map(w => w.h)), [deck]);
  const fresh = (entries ?? []).filter(e => !inDeck.has(e.h) && e.m);

  async function add() {
    if (busy || !fresh.length) return;
    setBusy(true);
    const n = await addWords(fresh);
    setAdded(n);
    setBusy(false);
    if (!done) onMark();
  }

  return (
    <>
      <div style={{ maxWidth: 620 }}>
        <p style={{ fontSize: 14.5, lineHeight: 1.72, color: 'var(--ink)', margin: '0 0 18px' }}>
          {words.length} words. Adding them puts each one in your deck as a new card, reviewed
          from tomorrow — the same thing that happens when you tap a word while reading.
        </p>
      </div>

      {entries === null ? (
        <div style={{ ...MONO, fontSize: 11, color: 'var(--ink-faint)' }}>loading definitions…</div>
      ) : (
        <div
          className="grid gap-x-6 gap-y-1.5 items-start"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', maxWidth: 780 }}
        >
          {entries.map(e => (
            <div key={e.h} className="flex items-baseline gap-2 min-w-0">
              <span style={{ fontSize: 14, color: 'var(--ink)', flexShrink: 0 }}>{e.h}</span>
              {/* One sense, the rest on a tap — the same treatment the word popup gives.
                  Deliberately NOT truncated with an ellipsis any more: a row that can expand
                  has to be allowed to wrap, or the extra senses open into a clipped line. */}
              <span className="min-w-0" style={{ fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.45 }}>
                {e.m ? <GlossText gloss={e.m} collapsible /> : '—'}
              </span>
              {inDeck.has(e.h) && (
                <span style={{ ...MONO, fontSize: 9, color: 'var(--jade)', flexShrink: 0 }} title="already in your deck">✓</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 pt-5 flex items-center gap-3 flex-wrap" style={{ borderTop: '1px solid var(--line)' }}>
        <button
          onClick={add}
          disabled={busy || !fresh.length}
          className="rounded-lg transition-all duration-150"
          style={{
            ...MONO, fontSize: 10.5, padding: '9px 15px', fontWeight: 600, border: 'none',
            background: fresh.length ? 'var(--jade)' : 'none',
            color: fresh.length ? '#fff' : 'var(--ink-faint)',
            cursor: fresh.length && !busy ? 'pointer' : 'default',
            opacity: busy ? .6 : 1,
          }}
        >
          {!entries ? 'Add to my deck'
            : fresh.length ? `Add ${fresh.length} word${fresh.length === 1 ? '' : 's'} to my deck`
            : 'All of these are already in your deck'}
        </button>
        {added !== null && added > 0 && (
          <button
            onClick={onNavigateSrs}
            className="cursor-pointer"
            style={{ ...MONO, fontSize: 10.5, background: 'none', border: 'none', color: 'var(--jade)', padding: 0 }}
          >
            {added} added — review them in SRS ›
          </button>
        )}
      </div>
      {done && streakNote && <StreakBanner note={streakNote} />}
    </>
  );
}
