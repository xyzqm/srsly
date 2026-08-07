'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LanguageCode } from '@/lib/types';
import { loadLevelTable, loadVocabTable } from '@/lib/curriculum';
import { levelLabel, levelNumbers, getLanguageConfig } from '@/lib/languageConfig';
import {
  buildBlock, scoreBlock, placementResult, passingScore,
  PLACEMENT_BLOCK, CHALLENGE_BLOCK,
  type TestQuestion, type BlockResult,
} from '@/lib/levelTest';

/**
 * The level test, in both its shapes (see lib/levelTest.ts for the model).
 *
 * Placement walks levels upward and stops at the first one you fail; challenge is a single
 * level you are trying to skip to. The two differ only in which levels get queued and how
 * long each block is, so they share everything below.
 */

interface Props {
  language: LanguageCode;
  /** 'placement' walks up from the easiest level; a number challenges that one level. */
  mode: 'placement' | number;
  /** Called with the highest level passed (0 = none). Fires once, when the run ends. */
  onFinish: (through: number) => void;
  onClose: () => void;
}

type Phase = 'loading' | 'unavailable' | 'asking' | 'blockDone' | 'finished';

export default function LevelTest({ language, mode, onFinish, onClose }: Props) {
  const levels = useMemo(() => levelNumbers(language), [language]);
  const queue  = useMemo(
    () => (mode === 'placement' ? levels.slice() : [mode]),
    [mode, levels],
  );
  const blockSize = mode === 'placement' ? PLACEMENT_BLOCK : CHALLENGE_BLOCK;

  const [tables, setTables] = useState<{
    levelTable: Record<number, string[]>;
    vocab: Record<string, { meaning: string; reading?: string; pinyin?: string }>;
  } | null>(null);
  const [phase, setPhase]   = useState<Phase>('loading');
  const [qi, setQi]         = useState(0);         // index within the current block
  const [bi, setBi]         = useState(0);         // index within `queue`
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [answers, setAnswers]     = useState<(string | null)[]>([]);
  const [results, setResults]     = useState<BlockResult[]>([]);
  const [picked, setPicked]       = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([loadLevelTable(language), loadVocabTable(language)]).then(([levelTable, vocab]) => {
      if (!live) return;
      // No tables means no definitions, and a test must never invent one.
      if (!levelTable || !vocab) { setPhase('unavailable'); return; }
      setTables({ levelTable, vocab });
    });
    return () => { live = false; };
  }, [language]);

  // Start (or advance to) a block once the tables are in.
  useEffect(() => {
    if (!tables || phase === 'unavailable' || phase === 'finished' || phase === 'blockDone') return;
    if (questions.length > 0) return;
    const level = queue[bi];
    if (level === undefined) { setPhase('finished'); return; }
    const block = buildBlock(level, tables.levelTable[level] ?? [], tables.vocab, blockSize);
    if (block.questions.length < 4) { setPhase('unavailable'); return; }
    setQuestions(block.questions);
    setAnswers(new Array(block.questions.length).fill(null));
    setQi(0);
    setPicked(null);
    setPhase('asking');
  }, [tables, phase, questions.length, queue, bi, blockSize]);

  const answer = useCallback((choice: string) => {
    if (picked !== null) return;
    setPicked(choice);
    const next = answers.slice();
    next[qi] = choice;
    setAnswers(next);
    // A brief pause so the right answer is visible before moving on — being told only
    // "wrong" without being shown the answer teaches nothing.
    setTimeout(() => {
      if (qi + 1 < questions.length) { setQi(qi + 1); setPicked(null); return; }
      const result = scoreBlock(questions[0].level, next, questions);
      setResults(r => [...r, result]);
      setPhase('blockDone');
    }, 750);
  }, [picked, answers, qi, questions]);

  // Keyboard: 1–4 pick an option.
  useEffect(() => {
    if (phase !== 'asking') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key < '1' || e.key > '4') return;
      const opt = questions[qi]?.options[Number(e.key) - 1];
      if (opt) { e.preventDefault(); answer(opt); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, questions, qi, answer]);

  const finish = useCallback((through: number) => {
    setPhase('finished');
    onFinish(through);
  }, [onFinish]);

  const mono = { fontFamily: 'var(--f-mono)' as const };
  const panel = (children: React.ReactNode) => (
    <div className="rounded-[13px] px-7 py-7 mt-4"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 4px 20px rgba(0,0,0,.05)' }}>
      {children}
    </div>
  );

  if (phase === 'loading') {
    return panel(<div className="text-center py-8" style={{ ...mono, fontSize: 12, color: 'var(--ink-faint)' }}>Loading…</div>);
  }

  if (phase === 'unavailable') {
    return panel(
      <div className="text-center py-6">
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.6, maxWidth: '40ch', margin: '0 auto' }}>
          This level doesn&apos;t have enough defined words to build a test from. You can still
          unlock it by studying.
        </p>
        <button onClick={onClose} className="cursor-pointer mt-5"
          style={{ ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 8, padding: '10px 18px' }}>
          Close
        </button>
      </div>,
    );
  }

  if (phase === 'blockDone') {
    const last = results[results.length - 1];
    const need = passingScore(last.total);
    const more = mode === 'placement' && last.passed && bi + 1 < queue.length;
    return panel(
      <div className="text-center py-5">
        <div style={{ ...mono, fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          {levelLabel(language, last.level)}
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 40, fontWeight: 500, marginTop: 6, color: last.passed ? 'var(--jade)' : 'var(--accent)' }}>
          {last.correct} / {last.total}
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, margin: '6px 0 0', lineHeight: 1.6 }}>
          {last.passed
            ? more ? 'Passed. Trying the next level up.' : 'Passed.'
            : `${need} needed to pass.`}
        </p>
        <div className="flex justify-center gap-2 mt-6 flex-wrap">
          {more ? (
            <button
              onClick={() => { setQuestions([]); setBi(bi + 1); setPhase('asking'); }}
              className="cursor-pointer"
              style={{ ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)' }}
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={() => finish(mode === 'placement' ? placementResult(results) : (last.passed ? last.level : 0))}
              className="cursor-pointer"
              style={{ ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)' }}
            >
              See result
            </button>
          )}
        </div>
      </div>,
    );
  }

  if (phase === 'finished') {
    const through = mode === 'placement' ? placementResult(results) : (results.at(-1)?.passed ? (mode as number) : 0);
    return panel(
      <div className="text-center py-5">
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500 }}>
          {through > 0 ? `${levelLabel(language, through)} unlocked` : 'Starting at the beginning'}
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, margin: '8px auto 0', maxWidth: '38ch', lineHeight: 1.6 }}>
          {through > 0
            ? 'Everything up to and including it is now open. You can still study the levels below it.'
            : 'Nothing unlocked this time — the first level is open anyway, and studying unlocks the rest.'}
        </p>
        <button onClick={onClose} className="cursor-pointer mt-6"
          style={{ ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)' }}>
          Done
        </button>
      </div>,
    );
  }

  const q = questions[qi];
  if (!q) return null;
  const cfg = getLanguageConfig(language);

  return panel(
    <>
      <div className="flex items-baseline justify-between mb-5">
        <div style={{ ...mono, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          {levelLabel(language, q.level)} · {qi + 1} of {questions.length}
        </div>
        <button onClick={onClose} className="cursor-pointer"
          style={{ ...mono, fontSize: 11, letterSpacing: '.06em', background: 'none', border: 'none', color: 'var(--ink-faint)' }}>
          Cancel
        </button>
      </div>

      <div className="h-[3px] rounded-full mb-7" style={{ background: 'var(--line-soft)' }}>
        <div style={{ width: `${((qi) / questions.length) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 99, transition: 'width .3s' }} />
      </div>

      <div className="text-center mb-7">
        <div style={{
          fontFamily: cfg.scriptIsUnspaced ? 'var(--f-han)' : 'var(--f-display)',
          fontSize: cfg.scriptIsUnspaced ? 64 : 44,
          fontWeight: cfg.scriptIsUnspaced ? ('var(--han-weight)' as 'bold') : 500,
          lineHeight: 1.1, letterSpacing: '.01em',
        }}>
          {q.word}
        </div>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr' }}>
        {q.options.map((opt, i) => {
          const isAnswer = opt === q.answer;
          const chosen   = picked === opt;
          // Reveal only once an answer is locked in.
          const state = picked === null ? 'idle' : isAnswer ? 'right' : chosen ? 'wrong' : 'dim';
          return (
            <button
              key={opt}
              onClick={() => answer(opt)}
              disabled={picked !== null}
              className="text-left transition-all duration-150"
              style={{
                cursor: picked === null ? 'pointer' : 'default',
                background: state === 'right' ? 'color-mix(in srgb, var(--jade) 14%, var(--card))'
                  : state === 'wrong' ? 'color-mix(in srgb, var(--accent) 12%, var(--card))'
                  : 'var(--card)',
                border: `1px solid ${state === 'right' ? 'var(--jade)' : state === 'wrong' ? 'var(--accent)' : 'var(--line)'}`,
                opacity: state === 'dim' ? 0.45 : 1,
                borderRadius: 10, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <span style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)', border: '1px solid var(--line)', borderRadius: 5, padding: '2px 6px', minWidth: 22, textAlign: 'center' }}>
                {i + 1}
              </span>
              <span style={{ fontSize: 15, lineHeight: 1.4 }}>{opt}</span>
            </button>
          );
        })}
      </div>
    </>,
  );
}
