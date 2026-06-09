'use client';
import { useState } from 'react';
import type { PassageToken } from '@/lib/types';
import { FILL_ITEMS } from '@/lib/data/fill';
import { speak } from '@/lib/speech';

function renderTokens(tokens: PassageToken[], showPinyin: boolean) {
  return tokens.map((t, i) => {
    if (!t.pinyin) return <span key={i}>{t.text}</span>;
    return <ruby key={i}>{t.text}{showPinyin && <rt>{t.pinyin}</rt>}</ruby>;
  });
}

interface Props { onDone: () => void; showPinyin: boolean; }

export default function FillInBlank({ onDone, showPinyin }: Props) {
  const [answers, setAnswers] = useState<Record<number, { correct: boolean; chosen: string } | null>>({});

  const allDone = FILL_ITEMS.every((_, i) => answers[i] != null);

  return (
    <div>
      <div className="flex justify-between items-end mb-4 flex-wrap gap-2">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Fill in the blank · generated</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, letterSpacing: '-.01em', marginTop: 4 }}>Choose the missing word</div>
        </div>
      </div>

      <p style={{ fontSize: 14.5, color: 'var(--ink-soft)', lineHeight: 1.55, maxWidth: '54ch', marginBottom: 22 }}>
        Each sentence uses today&apos;s vocabulary. Pick the word that fits — a wrong choice reveals the answer and sends that word back to tomorrow&apos;s queue, just like peeking in a passage.
      </p>

      <div className={showPinyin ? 'show-pinyin' : ''}>
        {FILL_ITEMS.map((item, idx) => {
          const ans = answers[idx];
          const fullText = item.before.map(t => t.text).join('') + item.answer[0] + item.after.map(t => t.text).join('');

          return (
            <div key={idx} className="rounded-xl px-5 py-5 mb-4" style={{ border: '1px solid var(--line)', background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 40%, white), var(--card))' }}>
              <div className="flex items-start gap-3 mb-4">
                <button
                  onClick={() => speak(fullText)}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer mt-1"
                  style={{ border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)' }}
                >
                  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>
                  </svg>
                </button>
                <div style={{ fontFamily: 'var(--f-han)', fontSize: 21, lineHeight: 1.9, fontWeight: 'var(--han-weight)' as 'bold' }}>
                  {renderTokens(item.before, showPinyin)}
                  <span
                    className="inline-block text-center mx-1 px-1"
                    style={{
                      minWidth: 54,
                      borderBottom: `2px solid ${ans ? (ans.correct ? 'var(--jade)' : 'var(--accent)') : 'var(--accent)'}`,
                      color: ans ? (ans.correct ? 'var(--jade)' : 'var(--accent)') : 'var(--ink-faint)',
                    }}
                  >
                    {ans ? (
                      <ruby>{item.answer[0]}<rt>{item.answer[1]}</rt></ruby>
                    ) : '＿＿'}
                  </span>
                  {renderTokens(item.after, showPinyin)}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap pl-10">
                {item.options.map(([hanzi, pinyin, correct], oi) => {
                  const chosen = ans?.chosen === hanzi;
                  const showCorrectMark = ans && correct;
                  const showWrongMark = ans && chosen && !correct;
                  return (
                    <button
                      key={oi}
                      disabled={!!ans}
                      onClick={() => {
                        if (ans) return;
                        setAnswers(prev => ({ ...prev, [idx]: { correct, chosen: hanzi } }));
                      }}
                      className="cursor-pointer transition-all duration-150 disabled:cursor-default"
                      style={{
                        fontFamily: 'var(--f-han)', fontSize: 17,
                        background: showCorrectMark ? 'var(--jade-soft)' : showWrongMark ? 'var(--accent-soft)' : 'var(--paper-2)',
                        border: showCorrectMark ? '1px solid var(--jade)' : showWrongMark ? '1px solid var(--accent)' : '1px solid var(--line)',
                        color: showCorrectMark ? 'var(--jade)' : showWrongMark ? 'var(--accent)' : 'var(--ink)',
                        borderRadius: 9, padding: '9px 17px',
                        fontWeight: 'var(--han-weight)' as 'bold',
                      }}
                    >
                      <ruby>{hanzi}<rt>{pinyin}</rt></ruby>
                    </button>
                  );
                })}
              </div>

              {ans && !ans.correct && (
                <div className="pl-10 mt-3 text-[12.5px]" style={{ color: 'var(--accent)' }}>
                  ↺ Answer revealed — {item.answer[0]} goes back to tomorrow&apos;s queue.
                </div>
              )}
              {ans && ans.correct && (
                <div className="pl-10 mt-3 text-[12.5px]" style={{ color: 'var(--jade)' }}>Correct.</div>
              )}
            </div>
          );
        })}
      </div>

      {allDone && (
        <div className="flex justify-center mt-8 pt-6" style={{ borderTop: '1px solid var(--line-soft)' }}>
          <button
            onClick={onDone}
            className="cursor-pointer transition-all duration-150"
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px',
              boxShadow: '0 2px 0 var(--accent-deep)',
            }}
          >
            Continue to conversation →
          </button>
        </div>
      )}

      <div className="text-center mt-6 text-xs" style={{ color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', letterSpacing: '.04em' }}>
        Same eight words — now in context
      </div>
    </div>
  );
}
