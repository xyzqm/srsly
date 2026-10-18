'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { storage } from '@/lib/storage';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { type Lesson } from '@/lib/lessons';
import { getLanguageConfig } from '@/lib/languageConfig';
import LessonPractice from './LessonPractice';
import WordPopup from '@/components/read/WordPopup';
import { useLessonInspect } from './useLessonInspect';
import { lessonsFor } from '@/lib/data/lessons';
import { unitsFor, nextInCourse, unitProgress, type LessonUnit } from '@/lib/data/lessons/units';
import { BEGINNER_THEMES } from '@/lib/data/beginner-themes';
import { preloadDict, lookupReading } from '@/lib/data/lookup';
import GlossText from '@/components/shared/GlossText';

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

  const mark = useCallback((id: string) => {
    setDone(prev => {
      const next = new Set(prev);
      const finishing = !next.has(id);
      if (finishing) next.add(id); else next.delete(id);
      void storage.saveLessonsDone([...next]);
      if (finishing) void countToday();
      return next;
    });
  }, [countToday]);

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
    <div
      className="rounded-tr-xl rounded-b-xl px-4 py-5 sm:px-9 sm:py-8 animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
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
        : <CoursePath units={units} byId={byId} done={done} doneLoaded={doneLoaded}
            next={next} onOpen={setOpenId} />}
    </div>
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
   * `null` is "not chosen yet" and is NOT the same as "none open" — the mistake this repo
   * names four times over. Until storage answers, `next` is null and every unit would collapse,
   * so a returning learner would watch the course open itself a beat after it rendered shut.
   * The effect runs once `doneLoaded` flips and the user's own clicks win from then on.
   */
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!doneLoaded || touched) return;
    setOpenUnit(next ? next.unit.id : units[0]?.id ?? null);
  }, [doneLoaded, touched, next, units]);

  const totalDone = doneLoaded ? units.reduce((n, u) => n + unitProgress(u, done).done, 0) : 0;
  const total = units.reduce((n, u) => n + u.lessons.length, 0);
  const nextLesson = next ? byId.get(next.lessonId) : undefined;

  return (
    <>
      {/*
        ── THE CONTINUE CARD ────────────────────────────────────────────────────
        One control, naming one lesson, at the top. The reserved min-height is not decoration:
        `next` is unknown until storage answers, and a card that appears a moment after the
        page does shoves the entire course down under the reader's cursor.
      */}
      <div
        className="rounded-[14px] px-5 py-4 mb-7 flex items-center gap-4 flex-wrap"
        style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', minHeight: 92 }}
      >
        {!doneLoaded ? (
          <div style={{ ...MONO, fontSize: 11, color: 'var(--ink-faint)' }}>finding your place…</div>
        ) : next && nextLesson ? (
          <>
            <div className="min-w-0 flex-1">
              <div style={{ ...MONO, fontSize: 9.5, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 4 }}>
                {totalDone === 0 ? 'Start here' : 'Continue'} · Unit {next.index + 1}, {next.unit.title}
              </div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 21, color: 'var(--ink)', lineHeight: 1.2 }}>
                {nextLesson.title}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3 }}>{nextLesson.summary}</div>
            </div>
            <button
              onClick={() => onOpen(next.lessonId)}
              className="cursor-pointer rounded-lg transition-all duration-150 shrink-0"
              style={{ ...MONO, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
                fontWeight: 600, padding: '12px 20px', background: 'var(--accent)', border: 'none',
                color: '#fff', boxShadow: '0 2px 0 var(--accent-deep)' }}
            >
              {totalDone === 0 ? 'Begin' : 'Continue'}
            </button>
          </>
        ) : (
          /* FINISHING THE COURSE IS A REAL STATE and gets a real sentence, not an empty card.
             It also must not read as the end of the app: the course was always the way in to
             reading, and reading is the thing that does not run out. */
          <div className="min-w-0">
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 21, color: 'var(--ink)' }}>
              You have been through the whole course.
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 3 }}>
              Every unit is read. Re-open any of them whenever a rule stops being obvious —
              and keep reading, which is where the rest of the language is.
            </div>
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between mb-1">
        <div style={{ ...MONO, fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          The course
        </div>
        <div style={{ ...MONO, fontSize: 10, color: 'var(--ink-faint)' }}>
          {doneLoaded ? `${totalDone} / ${total}` : `${total} lessons`}
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.6, margin: '0 0 18px', maxWidth: 560 }}>
        {units.length} units, in order — each one teaches a handful of words and the grammar that
        uses them. Nothing is locked; open any of it whenever you like.
      </p>

      <div className="flex flex-col gap-2">
        {units.map((u, i) => (
          <UnitBlock
            key={u.id}
            unit={u}
            n={i + 1}
            byId={byId}
            done={done}
            doneLoaded={doneLoaded}
            nextId={next?.lessonId}
            open={openUnit === u.id}
            onToggle={() => { setTouched(true); setOpenUnit(openUnit === u.id ? null : u.id); }}
            onOpen={onOpen}
          />
        ))}
      </div>
    </>
  );
}

/**
 * One unit: a heading that is always visible, and its lessons when it is open.
 *
 * The progress rule is SEGMENTED — one tick per lesson — rather than a continuous bar, for the
 * reason `BadgeSeal` draws one arc per rung: "3 of 5" is legible without reading the caption,
 * where a 60%-filled bar is a proportion you have to translate back into a number of things.
 */
function UnitBlock({ unit, n, byId, done, doneLoaded, nextId, open, onToggle, onOpen }: {
  unit: LessonUnit;
  n: number;
  byId: Map<string, Lesson>;
  done: Set<string>;
  doneLoaded: boolean;
  nextId?: string;
  open: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
}) {
  const { done: d, total } = unitProgress(unit, done);
  const complete = doneLoaded && d === total;

  return (
    <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--line)' }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left cursor-pointer transition-all duration-150 flex items-center gap-3.5"
        style={{ background: 'none', border: 'none', padding: '13px 15px', color: 'var(--ink)' }}
      >
        <span
          aria-hidden
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{
            ...MONO, fontSize: 11, letterSpacing: 0, width: 27, height: 27,
            border: `1px solid ${complete ? 'var(--jade)' : 'var(--line)'}`,
            background: complete ? 'var(--jade)' : 'none',
            color: complete ? '#fff' : 'var(--ink-faint)',
          }}
        >
          {complete ? '✓' : n}
        </span>
        <span className="min-w-0 flex-1">
          <span style={{ fontSize: 15, display: 'block', fontWeight: 500 }}>{unit.title}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginTop: 1, lineHeight: 1.45 }}>
            {unit.blurb}
          </span>
        </span>
        {/* The ticks carry the number, so they are hidden from a screen reader and the count
            beside them is what is announced. */}
        <span className="shrink-0 flex items-center gap-2.5">
          {doneLoaded && (
            <span aria-hidden className="hidden sm:flex gap-[3px]">
              {unit.lessons.map((id, i) => (
                <span key={i} style={{ width: 13, height: 3, borderRadius: 2,
                  background: done.has(id) ? 'var(--jade)' : 'var(--line)' }} />
              ))}
            </span>
          )}
          <span style={{ ...MONO, fontSize: 10, color: 'var(--ink-faint)', minWidth: 30, textAlign: 'right' }}>
            {doneLoaded ? `${d}/${total}` : `${total}`}
          </span>
          <span aria-hidden style={{ ...MONO, fontSize: 9, color: 'var(--ink-faint)',
            transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
        </span>
      </button>

      {open && (
        <div className="flex flex-col" style={{ borderTop: '1px solid var(--line)' }}>
          {unit.lessons.map(id => {
            const l = byId.get(id);
            if (!l) return null;   // a test makes this unreachable; rendering nothing beats throwing
            const isDone = done.has(id);
            const isNext = nextId === id;
            return (
              <button
                key={id}
                onClick={() => onOpen(id)}
                className="w-full text-left cursor-pointer transition-all duration-150 flex items-baseline gap-3"
                style={{ background: isNext ? 'var(--accent-soft)' : 'none', border: 'none',
                  padding: '10px 15px 10px 18px', color: 'var(--ink)' }}
                onMouseEnter={e => { if (!isNext) e.currentTarget.style.background = 'var(--line)'; }}
                onMouseLeave={e => { if (!isNext) e.currentTarget.style.background = 'none'; }}
              >
                <span aria-hidden style={{ ...MONO, fontSize: 10, letterSpacing: 0, flexShrink: 0,
                  minWidth: 27, textAlign: 'center',
                  color: isDone ? 'var(--jade)' : 'var(--ink-faint)', opacity: isDone ? 1 : .5 }}>
                  {isDone ? '✓' : l.kind === 'vocab' ? '◇' : '·'}
                </span>
                <span className="min-w-0 flex-1">
                  <span style={{ fontSize: 14, display: 'block' }}>{l.title}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', display: 'block', marginTop: 1, lineHeight: 1.45 }}>
                    {l.summary}
                  </span>
                </span>
                {/* WHICH KIND, said in a word rather than inferred from a glyph. The two end
                    differently — a grammar lesson is read and ticked, a word set is finished by
                    adding its words — so the reader is told which one they are opening. */}
                <span style={{ ...MONO, fontSize: 8.5, textTransform: 'uppercase', flexShrink: 0,
                  color: 'var(--ink-faint)', opacity: .8 }}>
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
