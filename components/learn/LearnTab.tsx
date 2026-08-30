'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { storage } from '@/lib/storage';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import {
  grammarLessons, vocabLessons, nextGrammarLesson, type Lesson,
} from '@/lib/lessons';
import { getLanguageConfig } from '@/lib/languageConfig';
import LessonPractice from './LessonPractice';
import WordPopup, { type PopupData } from '@/components/read/WordPopup';
import { bareWord } from '@/lib/lessonPractice';
import { lessonsFor } from '@/lib/data/lessons';
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
}

const MONO: React.CSSProperties = { fontFamily: 'var(--f-mono)', letterSpacing: '.08em' };

export default function LearnTab({ onNavigateSrs, active = true }: Props) {
  const language = useLanguage();
  const { deck, addWords, addWord } = useVocabDeck(language);
  const all = useMemo(() => lessonsFor(language), [language]);

  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  // Read in an effect, not in useState's initialiser, so the server render and the first
  // client render agree — otherwise React hydration mismatches on the ticks. Through
  // `storage` rather than localStorage directly, so a signed-in learner picks up lessons
  // they finished on another device instead of being sent back through the tree.
  useEffect(() => {
    let live = true;
    storage.getLessonsDone().then(ids => { if (live) setDone(new Set(ids)); });
    return () => { live = false; };
  }, []);

  // Opening a lesson while a different language is selected would show French lessons under
  // a Chinese deck; switching closes whatever was open, as EpubPanel does with its book.
  useEffect(() => { setOpenId(null); }, [language]);

  const mark = useCallback((id: string) => {
    setDone(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      void storage.saveLessonsDone([...next]);
      return next;
    });
  }, []);

  const open = all.find(l => l.id === openId) ?? null;
  const grammar = grammarLessons(all);
  const words = vocabLessons(all);
  const next = nextGrammarLesson(all, done);

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
          />
        : <LessonList grammar={grammar} words={words} done={done} next={next} onOpen={setOpenId} />}
    </div>
  );
}

/**
 * TWO SECTIONS, and only one of them is a course.
 *
 * Grammar builds on itself, so it is a single numbered track and the number is the whole
 * navigation: a learner who wants to be told what to do next reads down. Vocabulary sets have
 * no such dependency — nobody needs colours before food — so numbering them would invent a
 * prerequisite and make opening the one you wanted feel like skipping ahead.
 *
 * NUMBERED, STILL NEVER LOCKED. Nothing is disabled and there is no 🔒 anywhere; the arrow
 * marks where you left off rather than where you are allowed. See lib/lessons.ts.
 */
function LessonList({ grammar, words, done, next, onOpen }: {
  grammar: Lesson[];
  words: Lesson[];
  done: Set<string>;
  next?: Lesson;
  onOpen: (id: string) => void;
}) {
  const row = (l: Lesson, n?: number) => {
    const isDone = done.has(l.id);
    const isNext = next?.id === l.id;
    return (
      <button
        key={l.id}
        onClick={() => onOpen(l.id)}
        className="w-full text-left rounded-lg cursor-pointer transition-all duration-150 flex items-baseline gap-3"
        style={{
          background: 'none',
          border: `1px solid ${isNext ? 'var(--accent)' : 'var(--line)'}`,
          padding: '11px 14px',
          color: 'var(--ink)',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = isNext ? 'var(--accent)' : 'var(--line)')}
      >
        <span
          aria-hidden
          style={{
            ...MONO, fontSize: n === undefined ? 11 : 10.5, letterSpacing: 0, flexShrink: 0,
            minWidth: 20, textAlign: 'right',
            color: isDone ? 'var(--jade)' : 'var(--ink-faint)',
            opacity: isDone ? 1 : .55,
          }}
        >
          {isDone ? '✓' : n === undefined ? '·' : n}
        </span>
        <span className="min-w-0 flex-1">
          <span style={{ fontSize: 14.5, display: 'block' }}>{l.title}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginTop: 1 }}>
            {l.summary}
          </span>
        </span>
        {isNext && (
          <span style={{ ...MONO, fontSize: 9, textTransform: 'uppercase', color: 'var(--accent)', flexShrink: 0 }}>
            start here
          </span>
        )}
      </button>
    );
  };

  const grammarDone = grammar.filter(l => done.has(l.id)).length;
  const wordsDone = words.filter(l => done.has(l.id)).length;

  return (
    <>
      <div className="flex items-baseline justify-between mb-1">
        <div style={{ ...MONO, fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Grammar
        </div>
        <div style={{ ...MONO, fontSize: 10, color: 'var(--ink-faint)' }}>
          {grammarDone} / {grammar.length}
        </div>
      </div>

      {/* Said plainly, because a numbered list looks like a ladder and this one is not. */}
      <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.6, margin: '0 0 20px', maxWidth: 560 }}>
        The course, in order — each one builds on the last. Nothing is locked, so jump wherever
        you like; the numbers are only a suggestion of where to go next.
      </p>

      <div className="flex flex-col gap-1.5 mb-9">
        {grammar.map((l, i) => row(l, i + 1))}
      </div>

      <div className="flex items-baseline justify-between mb-1">
        <div style={{ ...MONO, fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Words
        </div>
        <div style={{ ...MONO, fontSize: 10, color: 'var(--ink-faint)' }}>
          {wordsDone} / {words.length}
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.6, margin: '0 0 20px', maxWidth: 560 }}>
        Sets of words by theme, in no particular order. Take whichever you want — adding a set
        puts its words in your deck.
      </p>

      <div className="flex flex-col gap-1.5">
        {words.map(l => row(l))}
      </div>
    </>
  );
}

function LessonView({ lesson, done, deck, addWords, addWord, onMark, onBack, onNavigateSrs, active }: {
  lesson: Lesson;
  done: boolean;
  deck: { h: string }[];
  addWords: (w: { h: string; p: string; m: string }[]) => Promise<number>;
  addWord: (w: { h: string; p: string; m: string }) => Promise<void>;
  onMark: () => void;
  onBack: () => void;
  onNavigateSrs?: () => void;
  active: boolean;
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
        ? <VocabLesson lesson={lesson} done={done} deck={deck} addWords={addWords} onMark={onMark} onNavigateSrs={onNavigateSrs} active={active} />
        : <GrammarLesson lesson={lesson} done={done} onMark={onMark} addWord={addWord} />}
    </>
  );
}

function GrammarLesson({ lesson, done, onMark, addWord }: {
  lesson: Lesson; done: boolean; onMark: () => void;
  addWord: (w: { h: string; p: string; m: string }) => Promise<void>;
}) {
  const language = useLanguage();
  const unspaced = getLanguageConfig(language).scriptIsUnspaced;
  const [practicing, setPracticing] = useState(false);
  const [popup, setPopup] = useState<PopupData | null>(null);

  // The examples are tappable, so the dictionary has to be here before the first tap —
  // the vocab lessons already preload it for their word lists, grammar lessons did not.
  useEffect(() => { void preloadDict(language); }, [language]);

  /** Same construction as LessonPractice — see there for why not `useWordPopup`. */
  const inspect = useCallback((tile: string, el: HTMLElement) => {
    const word = bareWord(tile);
    const { reading, meaning } = lookupReading(language, word);
    if (!reading && !meaning) return;
    setPopup({ word, pinyin: reading, meaning, type: 'free', anchorRect: el.getBoundingClientRect() });
  }, [language]);
  // Blank lines are paragraph breaks; single newlines are just the source file wrapping.
  const paras = (lesson.explanation ?? '').trim().split(/\n\s*\n/);
  // A single fused token cannot be reassembled — 待ってください。is one word — so it stays an
  // example and is not offered as a puzzle.
  const practice = (lesson.examples ?? []).filter(e => (e.tiles?.length ?? 0) > 1);

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
                          className="cursor-pointer"
                          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit',
                            color: 'inherit', borderBottom: '1px dotted var(--line)' }}
                        >
                          {unspaced ? t : `${t} `}
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
      </div>

      <WordPopup data={popup} onClose={() => setPopup(null)}
        onAddVocab={(h, p, m) => { void addWord({ h, p, m }); setPopup(null); }} />
    </>
  );
}

function VocabLesson({ lesson, done, deck, addWords, onMark, onNavigateSrs, active }: {
  lesson: Lesson;
  done: boolean;
  deck: { h: string }[];
  addWords: (w: { h: string; p: string; m: string }[]) => Promise<number>;
  onMark: () => void;
  onNavigateSrs?: () => void;
  active: boolean;
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
    </>
  );
}
