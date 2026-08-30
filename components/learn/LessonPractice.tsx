'use client';
import { useMemo, useRef, useState } from 'react';
import type { LanguageCode } from '@/lib/types';
import type { Lesson } from '@/lib/lessons';
import { buildQuestions, isCorrect, promptFor, type PracticeQuestion } from '@/lib/lessonPractice';
import { hasInspectModifier } from '@/lib/inspectGesture';
import WordPopup from '@/components/read/WordPopup';
import PracticeTiles from './PracticeTiles';
import { useLessonInspect } from './useLessonInspect';

/**
 * A run of practice questions for one lesson.
 *
 * ── ONE AT A TIME, WITH AN END ──
 * Practice used to be every exercise laid down the page at once. That is a worksheet: no
 * progress, no finish, and a wrong answer so cheap there was no reason to think first. This
 * asks one question, fills a bar, and stops — and the ones you got wrong come back at the end
 * rather than being silently forgiven.
 *
 * ── THE EXPLANATION SHOWS EITHER WAY ──
 * Being right does not mean you knew why. The full sentence and its meaning appear after
 * every answer, correct or not, because that is the part that teaches; the check is only what
 * makes you commit first.
 *
 * ── AND IT STILL GRADES NOTHING ──
 * A wrong answer re-queues inside this session and does nothing else: no FSRS write, no
 * streak, no record that survives closing the lesson. The curriculum is deliberately separate
 * from scheduling, and a lesson you can fail is a lesson you avoid.
 */

const MONO = { fontFamily: 'var(--f-mono)' } as const;

interface Props {
  lesson: Lesson;
  language: LanguageCode;
  /** Chinese and Japanese join without spaces. */
  unspaced: boolean;
  /** Adds a word to the deck from the inspect popup. */
  onAddVocab: (word: string, pinyin: string, meaning: string) => void;
  onExit: () => void;
}

export default function LessonPractice({ lesson, language, unspaced, onAddVocab, onExit }: Props) {
  // Built once per mount: re-shuffling mid-session would move the questions under the
  // learner. Re-entering practice reshuffles, which is the point of coming back.
  const initial = useMemo(() => buildQuestions(lesson), [lesson]);

  const [queue, setQueue] = useState<PracticeQuestion[]>(initial);
  const [at, setAt] = useState(0);
  /**
   * Which POOL SLOTS have been placed, in answer order — indexes, never words.
   *
   * A sentence may legitimately use the same word twice, and a list of words cannot say which
   * copy is which. An index can, and it is also what lets the pool keep a used tile in its own
   * slot instead of closing the gap — see components/learn/PracticeTiles.tsx for why that
   * matters to the double-click.
   */
  const [placed, setPlaced] = useState<number[]>([]);
  /** The option chosen on a choice question — a different shape of answer, so its own state. */
  const [pick, setPick] = useState<string | null>(null);
  const [checked, setChecked] = useState<null | boolean>(null);
  /** Missed questions, replayed once the first pass is done. */
  const [retry, setRetry] = useState<PracticeQuestion[]>([]);
  const [done, setDone] = useState(0);
  const { popup, setPopup, inspect } = useLessonInspect(language);
  /**
   * What was selected before the most recent FIRST click, so a double-click can put it back.
   *
   * Recorded on `e.detail <= 1` — the browser's own click counter — because the second click
   * of a double fires its own `onClick` first, and without the guard it would overwrite the
   * very value the double-click is about to restore.
   */
  const beforePick = useRef<string | null>(null);

  const q = queue[at];
  // The bar measures answered-correctly against everything that must still be answered, so
  // a wrong answer visibly holds it back rather than advancing it.
  const total = initial.length + retry.length;
  const progress = total > 0 ? done / total : 0;

  if (!q) {
    return (
      <div className="text-center py-10">
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500 }}>
          Practice complete
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 8 }}>
          {initial.length} question{initial.length === 1 ? '' : 's'}
          {retry.length > 0 ? ` · ${retry.length} came back around` : ' · first time through'}
        </p>
        <button onClick={onExit} className="cursor-pointer rounded-lg mt-6"
          style={{ ...MONO, fontSize: 11, padding: '11px 18px', fontWeight: 600,
            background: 'var(--jade)', border: 'none', color: '#fff' }}>
          Back to the lesson
        </button>
      </div>
    );
  }

  const answer = q.kind === 'order' ? placed.map(i => q.shuffled[i]) : (pick === null ? [] : [pick]);
  const complete = q.kind === 'order' ? placed.length === q.tiles.length : pick !== null;
  const tone = checked === null ? undefined : checked ? 'var(--right)' : 'var(--wrong)';

  function check() {
    if (!complete || checked !== null) return;
    const ok = isCorrect(q, answer);
    setChecked(ok);
    if (ok) setDone(d => d + 1);
    // Missed questions go to the back rather than being repeated immediately — answering
    // again straight away tests short-term memory and nothing else.
    else setRetry(r => [...r, q]);
  }

  function next() {
    setChecked(null);
    setPlaced([]);
    setPick(null);
    if (at + 1 < queue.length) { setAt(at + 1); return; }
    if (retry.length > 0) { setQueue(retry); setRetry([]); setAt(0); return; }
    setAt(queue.length);          // falls through to the complete screen
  }

  return (
    <>
      {/* Progress, and a way out. The bar counts CORRECT answers against everything still
          owed, so it stalls when you miss one instead of marching on regardless. */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onExit} className="cursor-pointer" aria-label="Leave practice"
          style={{ ...MONO, fontSize: 16, background: 'none', border: 'none',
            color: 'var(--ink-faint)', padding: '4px 6px', lineHeight: 1 }}>
          ✕
        </button>
        <div className="flex-1 rounded-full overflow-hidden" style={{ height: 10, background: 'var(--line-soft)' }}>
          <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%',
            background: 'var(--jade)', borderRadius: 999, transition: 'width .35s ease' }} />
        </div>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--ink-faint)', minWidth: 44, textAlign: 'right' }}>
          {done}/{total}
        </span>
      </div>

      <div style={{ ...MONO, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase',
        color: 'var(--ink-faint)', marginBottom: 8 }}>
        {q.kind === 'order' ? 'Build the sentence' : 'Choose the missing word'}
      </div>

      {q.kind === 'order' ? (
        <>
          <div style={{ fontSize: 17, color: 'var(--ink)', marginBottom: 16, lineHeight: 1.5 }}>
            {promptFor(q)}
          </div>
          <PracticeTiles
            slots={q.shuffled}
            placed={placed}
            /* `into` and `from`, never `at` — the question index is also called `at`, and a
               parameter shadowing it here reads as if the drop position were the question. */
            onPlace={(slot, into) => setPlaced(p => [...p.slice(0, into), slot, ...p.slice(into)])}
            onMove={(from, to) => setPlaced(p => {
              const cut = [...p]; const [m] = cut.splice(from, 1); cut.splice(to, 0, m); return cut;
            })}
            onRemove={from => setPlaced(p => p.filter((_, j) => j !== from))}
            onInspect={inspect}
            tone={tone}
            disabled={checked !== null}
          />
        </>
      ) : (
        <>
          <div style={{ fontSize: 17, color: 'var(--ink)', marginBottom: 6, lineHeight: 1.5 }}>
            {promptFor(q)}
          </div>
          {/* The sentence with a gap where the answer goes. */}
          <div className="flex flex-wrap items-center gap-1 mb-5" style={{ fontSize: 22, lineHeight: 1.6 }}>
            {q.tiles.map((t, i) => (
              i === q.blankIndex ? (
                <span key={i} style={{ minWidth: 76, borderBottom: `2px solid ${tone ?? 'var(--accent)'}`,
                  display: 'inline-block', textAlign: 'center', color: tone ?? 'var(--ink)' }}>
                  {pick ?? ' '}
                </span>
              ) : (
                <span key={i}>{unspaced ? t : `${t} `}</span>
              )
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {q.options.map(o => {
              const picked = pick === o;
              return (
                <button
                  key={o}
                  /* The same four ways in as a tile has — see lib/inspectGesture.ts. A choice
                     button does not move when you click it, so the browser's own dblclick
                     fires on the button itself and there is no need for the tile row's manual
                     pairing; the only thing to undo is which option was highlighted. */
                  onClick={e => {
                    if (checked !== null) return;
                    if (hasInspectModifier(e)) { inspect(o, e.currentTarget); return; }
                    if (e.detail <= 1) beforePick.current = pick;
                    setPick(o);
                  }}
                  onDoubleClick={e => {
                    if (checked !== null) return;
                    setPick(beforePick.current);
                    inspect(o, e.currentTarget);
                  }}
                  onContextMenu={e => { e.preventDefault(); inspect(o, e.currentTarget as HTMLElement); }}
                  className="cursor-pointer rounded-lg"
                  style={{ fontSize: 16, padding: '10px 14px', minHeight: 44,
                    background: picked ? 'var(--accent-soft)' : 'var(--card)',
                    border: `1px solid ${picked ? (tone ?? 'var(--accent)') : 'var(--line)'}`,
                    color: 'var(--ink)' }}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Check, then the explanation — shown whether you were right or wrong. */}
      <div className="mt-6">
        {checked === null ? (
          <button onClick={check} disabled={!complete} className="rounded-lg transition-all duration-150"
            style={{ ...MONO, fontSize: 11, padding: '12px 20px', fontWeight: 600, border: 'none',
              background: complete ? 'var(--jade)' : 'none',
              color: complete ? '#fff' : 'var(--ink-faint)',
              cursor: complete ? 'pointer' : 'default' }}>
            Check
          </button>
        ) : (
          <div className="rounded-[12px] px-4 py-4"
            style={{ background: checked ? 'var(--jade-soft)' : 'var(--gold-soft)',
              border: `1px solid ${checked ? 'var(--jade)' : 'var(--gold)'}` }}>
            <div style={{ ...MONO, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase',
              color: checked ? 'var(--jade)' : 'var(--gold)', marginBottom: 6 }}>
              {checked ? '✓ Correct' : 'Not quite — it comes back later'}
            </div>
            <div style={{ fontSize: 19, color: 'var(--ink)', lineHeight: 1.5 }}>{q.example.text}</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.5 }}>
              {q.example.gloss}
            </div>
            <button onClick={next} className="cursor-pointer rounded-lg mt-4"
              style={{ ...MONO, fontSize: 11, padding: '11px 18px', fontWeight: 600,
                background: 'var(--jade)', border: 'none', color: '#fff' }}>
              Continue
            </button>
          </div>
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 14, lineHeight: 1.5 }}>
        Hold a word — or right-click, double-click, or ⌘/ctrl-click it — to see what it means,
        hear it, and add it to your deck. Nothing here is graded or scheduled.
      </p>

      <WordPopup
        data={popup}
        onClose={() => setPopup(null)}
        onAddVocab={(w, p, m) => { onAddVocab(w, p, m); setPopup(null); }}
      />
    </>
  );
}
