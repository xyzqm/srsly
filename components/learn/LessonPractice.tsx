'use client';
import { useCallback, useMemo, useState } from 'react';
import type { LanguageCode } from '@/lib/types';
import type { Lesson } from '@/lib/lessons';
import { buildQuestions, isCorrect, bareWord, promptFor, type PracticeQuestion } from '@/lib/lessonPractice';
import { lookupReading } from '@/lib/data/lookup';
import WordPopup, { type PopupData } from '@/components/read/WordPopup';
import PracticeTiles from './PracticeTiles';

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

/**
 * Tiles not yet placed — a MULTISET difference, not a set one.
 *
 * A sentence can legitimately use the same word twice (`我有两本书。` has no repeat, but
 * plenty do), so removing "every tile equal to this one" would empty the pool after the
 * first placement and make the question unanswerable. Each placed tile cancels exactly one
 * copy.
 */
function remainingTiles(all: string[], placed: string[]): string[] {
  const left = [...all];
  for (const p of placed) {
    const i = left.indexOf(p);
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

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
  const [placed, setPlaced] = useState<string[]>([]);
  const [checked, setChecked] = useState<null | boolean>(null);
  /** Missed questions, replayed once the first pass is done. */
  const [retry, setRetry] = useState<PracticeQuestion[]>([]);
  const [done, setDone] = useState(0);
  const [popup, setPopup] = useState<PopupData | null>(null);

  const q = queue[at];
  // The bar measures answered-correctly against everything that must still be answered, so
  // a wrong answer visibly holds it back rather than advancing it.
  const total = initial.length + retry.length;
  const progress = total > 0 ? done / total : 0;

  /**
   * Show what a tile means. Built here rather than through `useWordPopup`, because that hook
   * is driven by a React mouse event and a long-press has none — the same reason
   * PassageText constructs its own PopupData.
   */
  const inspect = useCallback((tile: string, el: HTMLElement) => {
    const word = bareWord(tile);
    const { reading, meaning } = lookupReading(language, word);
    if (!reading && !meaning) return;      // nothing to say; don't open an empty card
    setPopup({
      word, pinyin: reading, meaning, type: 'free',
      anchorRect: el.getBoundingClientRect(),
    });
  }, [language]);

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

  const answer = q.kind === 'order' ? placed : placed.slice(0, 1);
  const complete = q.kind === 'order' ? placed.length === q.tiles.length : placed.length === 1;
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
            placed={placed}
            pool={remainingTiles(q.tiles, placed)}
            onPlace={(t, i) => setPlaced(p => [...p.slice(0, i), t, ...p.slice(i)])}
            onMove={(from, to) => setPlaced(p => {
              const cut = [...p]; const [m] = cut.splice(from, 1); cut.splice(to, 0, m); return cut;
            })}
            onRemove={i => setPlaced(p => p.filter((_, j) => j !== i))}
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
                  {placed[0] ?? ' '}
                </span>
              ) : (
                <span key={i}>{unspaced ? t : `${t} `}</span>
              )
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {q.options.map(o => {
              const picked = placed[0] === o;
              return (
                <button
                  key={o}
                  onClick={() => checked === null && setPlaced([o])}
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
        Hold a word (or right-click) to see what it means, hear it, and add it to your deck.
        Nothing here is graded or scheduled.
      </p>

      <WordPopup
        data={popup}
        onClose={() => setPopup(null)}
        onAddVocab={(w, p, m) => { onAddVocab(w, p, m); setPopup(null); }}
      />
    </>
  );
}
