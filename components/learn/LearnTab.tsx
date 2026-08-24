'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { unitsFor, loadDone, saveDone, type Lesson } from '@/lib/lessons';
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
  const { deck, addWords } = useVocabDeck(language);
  const units = useMemo(() => unitsFor(lessonsFor(language)), [language]);

  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  // localStorage is read in an effect, not in useState's initialiser, so the server render
  // and the first client render agree — otherwise React hydration mismatches on the ticks.
  useEffect(() => { setDone(loadDone()); }, []);

  // Opening a lesson while a different language is selected would show French lessons under
  // a Chinese deck; switching closes whatever was open, as EpubPanel does with its book.
  useEffect(() => { setOpenId(null); }, [language]);

  const mark = useCallback((id: string) => {
    setDone(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveDone(next);
      return next;
    });
  }, []);

  const all = units.flatMap(u => u.lessons);
  const open = all.find(l => l.id === openId) ?? null;
  const finished = all.filter(l => done.has(l.id)).length;

  if (!all.length) return null;

  return (
    <div
      className="rounded-tr-xl rounded-b-xl px-9 py-8 animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
      {open
        ? <LessonView
            lesson={open}
            done={done.has(open.id)}
            deck={deck}
            addWords={addWords}
            onMark={() => mark(open.id)}
            onBack={() => setOpenId(null)}
            onNavigateSrs={onNavigateSrs}
            active={active}
          />
        : <LessonList units={units} done={done} finished={finished} total={all.length} onOpen={setOpenId} />}
    </div>
  );
}

function LessonList({ units, done, finished, total, onOpen }: {
  units: { unit: string; lessons: Lesson[] }[];
  done: Set<string>;
  finished: number;
  total: number;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between mb-1">
        <div style={{ ...MONO, fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Lessons
        </div>
        <div style={{ ...MONO, fontSize: 10, color: 'var(--ink-faint)' }}>
          {finished} / {total} done
        </div>
      </div>

      {/* Said plainly, because a numbered list of lessons looks like a ladder and this one is
          not. The app's whole argument is that you read what you want to read. */}
      <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.6, margin: '0 0 26px', maxWidth: 560 }}>
        Take these in any order, or skip them entirely — nothing here is locked, and none of it
        is required to start reading.
      </p>

      {units.map(u => (
        <div key={u.unit} className="mb-7">
          <div style={{ ...MONO, fontSize: 9.5, textTransform: 'uppercase', color: 'var(--ink-faint)', opacity: .8, marginBottom: 9 }}>
            {u.unit}
          </div>
          <div className="flex flex-col gap-1.5">
            {u.lessons.map(l => {
              const isDone = done.has(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => onOpen(l.id)}
                  className="w-full text-left rounded-lg cursor-pointer transition-all duration-150 flex items-baseline gap-3"
                  style={{
                    background: 'none',
                    border: '1px solid var(--line)',
                    padding: '11px 14px',
                    color: 'var(--ink)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
                >
                  <span
                    aria-hidden
                    style={{
                      ...MONO, fontSize: 11, letterSpacing: 0, flexShrink: 0, width: 14,
                      color: isDone ? 'var(--jade)' : 'var(--ink-faint)',
                      opacity: isDone ? 1 : .4,
                    }}
                  >
                    {isDone ? '✓' : '·'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span style={{ fontSize: 14.5, display: 'block' }}>{l.title}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginTop: 1 }}>
                      {l.summary}
                    </span>
                  </span>
                  <span style={{ ...MONO, fontSize: 9, textTransform: 'uppercase', color: 'var(--ink-faint)', opacity: .55, flexShrink: 0 }}>
                    {l.kind === 'vocab' ? 'words' : 'grammar'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function LessonView({ lesson, done, deck, addWords, onMark, onBack, onNavigateSrs, active }: {
  lesson: Lesson;
  done: boolean;
  deck: { h: string }[];
  addWords: (w: { h: string; p: string; m: string }[]) => Promise<number>;
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
        : <GrammarLesson lesson={lesson} done={done} onMark={onMark} />}
    </>
  );
}

function GrammarLesson({ lesson, done, onMark }: { lesson: Lesson; done: boolean; onMark: () => void }) {
  // Blank lines are paragraph breaks; single newlines are just the source file wrapping.
  const paras = (lesson.explanation ?? '').trim().split(/\n\s*\n/);

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
                <div style={{ fontSize: 15.5, color: 'var(--ink)', lineHeight: 1.5 }}>{ex.text}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 2, lineHeight: 1.5 }}>{ex.gloss}</div>
              </div>
            ))}
          </div>
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
