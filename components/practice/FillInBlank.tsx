'use client';
import { useState } from 'react';
import type { DeckWord } from '@/lib/types';
import type { FillItem } from '@/lib/types';
import { FILL_ITEMS } from '@/lib/data/fill';
import { speak, speakWithBlank } from '@/lib/speech';
import ClickableWord from '@/components/shared/ClickableWord';
import WordPopup from '@/components/read/WordPopup';
import { useWordPopup } from '@/hooks/useWordPopup';

interface Props {
  onDone: () => void;
  deck: DeckWord[];
  onAddVocab: (word: string, pinyin: string, meaning: string) => void;
  /** Override items — supplied by daily AI content. Falls back to FILL_ITEMS. */
  items?: FillItem[];
}

export default function FillInBlank({ onDone, deck, onAddVocab, items }: Props) {
  const activeItems = items ?? FILL_ITEMS;
  const [answers, setAnswers] = useState<Record<number, { correct: boolean; chosenOi: number } | null>>({});
  const { popup, openPopup, closePopup, handleAddVocab, handleLearnTomorrow } = useWordPopup(onAddVocab);

  // Reset answers when items change (e.g. daily content arrives)
  const itemsKey = activeItems.map(it => it.answer[0]).join(',');

  if (deck.length === 0) {
    return (
      <div className="text-center py-14">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: 52, color: 'var(--ink-faint)', fontWeight: 'var(--han-weight)' as 'bold' }}>空</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 10 }}>No words in your deck yet.</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 0', maxWidth: '34ch', marginInline: 'auto', lineHeight: 1.6 }}>
          Go to the <strong>Read</strong> tab and click any underlined word to add it, or add words manually in the <strong>Vocab</strong> tab.
        </p>
      </div>
    );
  }

  const allDone = activeItems.every((_, i) => answers[i] != null);

  return (
    <div>
      <div className="flex justify-between items-end mb-4 flex-wrap gap-2">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Fill in the blank · {items ? 'daily' : 'static'}</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, letterSpacing: '-.01em', marginTop: 4 }}>Choose the missing word</div>
        </div>
      </div>

      <p style={{ fontSize: 14.5, color: 'var(--ink-soft)', lineHeight: 1.55, maxWidth: '54ch', marginBottom: 22 }}>
        Each sentence uses today&apos;s vocabulary. Click the circle next to a choice to submit — or click any word to look it up first.
      </p>

      <div key={itemsKey}>
        {activeItems.map((item, idx) => {
          const ans = answers[idx];
          const beforeText = item.before.map(t => t.text).join('');
          const afterText  = item.after.map(t => t.text).join('');
          const fullText   = beforeText + item.answer[0] + afterText;

          return (
            <div key={idx} className="rounded-xl px-5 py-5 mb-4" style={{ border: '1px solid var(--line)', background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 40%, white), var(--card))' }}>
              {/* Sentence with blank */}
              <div className="flex items-start gap-3 mb-4">
                <button
                  onClick={() => ans ? speak(fullText) : speakWithBlank(beforeText, afterText)}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer mt-1"
                  style={{ border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)' }}
                >
                  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>
                  </svg>
                </button>
                <div style={{ fontFamily: 'var(--f-han)', fontSize: 21, lineHeight: 1.9, fontWeight: 'var(--han-weight)' as 'bold' }}>
                  {item.before.map((t, i) => <ClickableWord key={`b${i}`} token={t} onOpen={openPopup} />)}
                  <span
                    className="inline-block text-center mx-1 px-1"
                    style={{
                      minWidth: 54,
                      borderBottom: `2px solid ${ans ? (ans.correct ? 'var(--jade)' : 'var(--accent)') : 'var(--accent)'}`,
                      color: ans ? (ans.correct ? 'var(--jade)' : 'var(--accent)') : 'var(--ink-faint)',
                    }}
                  >
                    {ans ? item.answer[0] : '＿＿'}
                  </span>
                  {item.after.map((t, i) => <ClickableWord key={`a${i}`} token={t} onOpen={openPopup} />)}
                </div>
              </div>

              {/* Options — radio circle on left, tokens clickable */}
              <div className="flex flex-col gap-2 pl-10">
                {item.options.map(([hanzi, pinyin, correct], oi) => {
                  const showCorrect = ans != null && correct;
                  const isWrongSelected = ans != null && !correct && ans.chosenOi === oi;
                  const optToken = { text: hanzi, pinyin, meaning: '' };

                  return (
                    <div key={oi} className="flex items-center gap-3">
                      {/* Radio circle — submits */}
                      <button
                        disabled={!!ans}
                        onClick={() => {
                          if (ans) return;
                          setAnswers(prev => ({ ...prev, [idx]: { correct, chosenOi: oi } }));
                        }}
                        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer disabled:cursor-default"
                        style={{
                          border: `2px solid ${showCorrect ? 'var(--jade)' : isWrongSelected ? 'var(--accent)' : 'var(--line)'}`,
                          background: showCorrect ? 'var(--jade)' : isWrongSelected ? 'var(--accent)' : 'transparent',
                        }}
                        title={ans ? undefined : 'Select this answer'}
                      >
                        {showCorrect && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        {isWrongSelected && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✗</span>}
                      </button>

                      {/* Option text — clickable word */}
                      <div
                        className="flex-1 rounded-[9px] px-4 py-2.5"
                        style={{
                          fontFamily: 'var(--f-han)', fontSize: 17,
                          background: showCorrect ? 'var(--jade-soft)' : isWrongSelected ? 'var(--accent-soft)' : 'var(--paper-2)',
                          border: `1px solid ${showCorrect ? 'var(--jade)' : isWrongSelected ? 'var(--accent)' : 'var(--line)'}`,
                          color: showCorrect ? 'var(--jade)' : isWrongSelected ? 'var(--accent)' : 'var(--ink)',
                          fontWeight: 'var(--han-weight)' as 'bold',
                        }}
                      >
                        <ClickableWord token={optToken} onOpen={openPopup} />
                      </div>
                    </div>
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

      <WordPopup
        data={popup}
        onClose={closePopup}
        onAddVocab={handleAddVocab}
        onLearnTomorrow={handleLearnTomorrow}
      />
    </div>
  );
}
