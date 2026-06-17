'use client';
import { useState, useMemo, useEffect } from 'react';
import type { DeckWord } from '@/lib/types';
import type { FillItem } from '@/lib/types';
import { FILL_ITEMS } from '@/lib/data/fill';
import { speak, speakWithBlank } from '@/lib/speech';
import ClickableWord from '@/components/shared/ClickableWord';
import WordPopup from '@/components/read/WordPopup';
import { useWordPopup } from '@/hooks/useWordPopup';
import { groupReadings } from '@/lib/readings';
import { isDueToday } from '@/lib/deck';

interface Props {
  onDone: () => void;
  deck: DeckWord[];
  onAddVocab: (word: string, pinyin: string, meaning: string) => void;
  onGrade?: (hanzi: string, grade: number) => void;
  /** Override items — supplied by daily AI content. Falls back to FILL_ITEMS. */
  items?: FillItem[];
  /** True while the AI fill block is being generated for the deck's due words. */
  loading?: boolean;
}

/**
 * Per-item answer state:
 *  - wrongOis: option indices the user already tried and got wrong
 *  - resolved: true when no more clicks are allowed (correct, or 2 wrongs)
 *  - gotCorrect: true if they eventually selected the correct option
 */
interface ItemState {
  wrongOis: number[];
  resolved: boolean;
  gotCorrect: boolean;
}

export default function FillInBlank({ onDone, deck, onAddVocab, onGrade, items, loading }: Props) {
  const activeItems = items ?? FILL_ITEMS;
  const itemsKey = activeItems.map(it => it.answer[0]).join(',');

  // Shuffle options once per item set (at render time, not parse time)
  const shuffledItems = useMemo(() => activeItems.map(item => {
    const opts: typeof item.options = [...item.options];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return { ...item, options: opts };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [itemsKey]);

  const [itemStates, setItemStates] = useState<Record<number, ItemState>>({});

  // Reset state when the item set changes (e.g. daily content arrives)
  useEffect(() => { setItemStates({}); }, [itemsKey]);

  const deckWords = useMemo(() => new Set(deck.map(d => d.h)), [deck]);
  const deckReadings = useMemo(() => groupReadings(deck), [deck]);
  const { popup, openPopup, closePopup, handleAddVocab, handleLearnTomorrow, vocabClaimed, tomorrowClaimed } = useWordPopup(onAddVocab, deckWords, deckReadings);
  // Only show the vocab badge after the user explicitly adds a word in this session
  const claimKind = (text: string) =>
    (vocabClaimed.has(text) && deckWords.has(text)) ? 'vocab' as const
    : tomorrowClaimed.has(text) ? 'tomorrow' as const
    : null;

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

  const today = new Date().toISOString().slice(0, 10);
  const dueToday = deck.filter(w => isDueToday(w, today));
  if (dueToday.length === 0) {
    return (
      <div className="text-center py-14">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: 52, color: 'var(--jade)', fontWeight: 'var(--han-weight)' as 'bold' }}>好</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 10 }}>No vocab due today.</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 0', maxWidth: '36ch', marginInline: 'auto', lineHeight: 1.6 }}>
          All your words are scheduled for future review. Come back tomorrow!
        </p>
      </div>
    );
  }

  // While the AI block is generating, show a spinner rather than flashing static items.
  if (loading) {
    return (
      <div className="text-center py-14" style={{ color: 'var(--ink-soft)' }}>
        <div className="animate-pulse" style={{ fontFamily: 'var(--f-han)', fontSize: 52, color: 'var(--ink-faint)', fontWeight: 'var(--han-weight)' as 'bold' }}>填</div>
        <p style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, letterSpacing: '.06em', marginTop: 12 }}>
          Generating fill-in-the-blank for your due words…
        </p>
      </div>
    );
  }

  const allDone = shuffledItems.every((_, i) => itemStates[i]?.resolved === true);

  const handleOptionClick = (idx: number, oi: number, correct: boolean) => {
    const state = itemStates[idx];
    if (state?.resolved) return;
    if (state?.wrongOis.includes(oi)) return; // already tried this wrong option

    if (correct) {
      const wrongs = state?.wrongOis.length ?? 0;
      // Good (3) if first try, Hard (2) if had to try again
      const grade = wrongs === 0 ? 3 : 2;
      onGrade?.(shuffledItems[idx].answer[0], grade);
      setItemStates(prev => ({
        ...prev,
        [idx]: { wrongOis: state?.wrongOis ?? [], resolved: true, gotCorrect: true },
      }));
    } else {
      const newWrongs = [...(state?.wrongOis ?? []), oi];
      if (newWrongs.length >= 2) {
        // Two wrong tries — reveal the answer, grade Again (1)
        onGrade?.(shuffledItems[idx].answer[0], 1);
        setItemStates(prev => ({
          ...prev,
          [idx]: { wrongOis: newWrongs, resolved: true, gotCorrect: false },
        }));
      } else {
        // First wrong try — give them another chance
        setItemStates(prev => ({
          ...prev,
          [idx]: { wrongOis: newWrongs, resolved: false, gotCorrect: false },
        }));
      }
    }
  };

  // Session summary for the completion screen
  const summary = Object.values(itemStates).reduce(
    (acc, s) => {
      if (!s.resolved) return acc;
      if (s.gotCorrect && s.wrongOis.length === 0) acc.good++;
      else if (s.gotCorrect) acc.hard++;
      else acc.again++;
      return acc;
    },
    { good: 0, hard: 0, again: 0 },
  );

  return (
    <div>
      <div className="flex justify-between items-end mb-4 flex-wrap gap-2">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Fill in the blank</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, letterSpacing: '-.01em', marginTop: 4 }}>Choose the missing word</div>
        </div>
      </div>

      <p style={{ fontSize: 14.5, color: 'var(--ink-soft)', lineHeight: 1.55, maxWidth: '54ch', marginBottom: 22 }}>
        Each sentence uses today&apos;s vocabulary. You get two tries per blank — first try correct earns the best interval, second try or a miss pushes it to review sooner.
      </p>

      {shuffledItems.map((item, idx) => {
        const state = itemStates[idx];
        const beforeText = item.before.map(t => t.text).join('');
        const afterText  = item.after.map(t => t.text).join('');
        const fullText   = beforeText + item.answer[0] + afterText;

        const blankColor = state?.resolved
          ? state.gotCorrect ? 'var(--jade)' : 'var(--accent)'
          : state?.wrongOis.length ? 'var(--gold)' : 'var(--accent)';

        return (
          <div key={idx} className="rounded-xl px-5 py-5 mb-4" style={{ border: '1px solid var(--line)', background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 40%, var(--paper)), var(--card))' }}>
            {/* Sentence with blank */}
            <div className="flex items-start gap-3 mb-4">
              <button
                onClick={() => state?.resolved ? speak(fullText) : speakWithBlank(beforeText, afterText)}
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer mt-1"
                style={{ border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)' }}
              >
                <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>
                </svg>
              </button>
              <div style={{ fontFamily: 'var(--f-han)', fontSize: 21, lineHeight: 1.9, fontWeight: 'var(--han-weight)' as 'bold' }}>
                {item.before.map((t, i) => <ClickableWord key={`b${i}`} token={t} onOpen={openPopup} claimKind={claimKind(t.text)} />)}
                <span
                  className="inline-block text-center mx-1 px-1"
                  style={{
                    minWidth: 54,
                    borderBottom: `2px solid ${blankColor}`,
                    color: state?.resolved ? blankColor : 'var(--ink-faint)',
                  }}
                >
                  {state?.resolved ? item.answer[0] : '＿＿'}
                </span>
                {item.after.map((t, i) => <ClickableWord key={`a${i}`} token={t} onOpen={openPopup} claimKind={claimKind(t.text)} />)}
              </div>
            </div>

            {/* Options */}
            <div className="flex flex-col gap-2 pl-10">
              {item.options.map(([hanzi, pinyin, correct], oi) => {
                const wasTriedWrong  = state?.wrongOis.includes(oi) === true;
                const showAsCorrect  = state?.resolved && correct;
                const isDisabled     = !!state?.resolved || wasTriedWrong;
                const isGreyed       = !!state?.resolved && !correct && !wasTriedWrong;
                const optToken       = { text: hanzi, pinyin, meaning: '' };

                let borderColor = 'var(--line)';
                let bg = 'var(--paper-2)';
                let textColor = 'var(--ink)';
                if (showAsCorrect)  { borderColor = 'var(--jade)';   bg = 'var(--jade-soft)';   textColor = 'var(--jade)'; }
                else if (wasTriedWrong) { borderColor = 'var(--accent)'; bg = 'var(--accent-soft)'; textColor = 'var(--accent)'; }
                else if (isGreyed)  { textColor = 'var(--ink-faint)'; }

                return (
                  <div key={oi} className="flex items-center gap-3">
                    {/* Radio / result indicator */}
                    <button
                      disabled={isDisabled}
                      onClick={() => handleOptionClick(idx, oi, correct)}
                      className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer disabled:cursor-default"
                      style={{
                        border: `2px solid ${showAsCorrect ? 'var(--jade)' : wasTriedWrong ? 'var(--accent)' : 'var(--line)'}`,
                        background: showAsCorrect ? 'var(--jade)' : wasTriedWrong ? 'var(--accent)' : 'transparent',
                        opacity: isGreyed ? 0.4 : 1,
                      }}
                      title={isDisabled ? undefined : 'Select this answer'}
                    >
                      {showAsCorrect   && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                      {wasTriedWrong   && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✗</span>}
                    </button>

                    {/* Option text */}
                    <div
                      className="flex-1 rounded-[9px] px-4 py-2.5 transition-all duration-150"
                      style={{
                        fontFamily: 'var(--f-han)', fontSize: 17,
                        background: bg, border: `1px solid ${borderColor}`,
                        color: textColor, fontWeight: 'var(--han-weight)' as 'bold',
                        opacity: isGreyed ? 0.45 : 1,
                      }}
                    >
                      <ClickableWord token={optToken} onOpen={openPopup} claimKind={claimKind(hanzi)} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Feedback message */}
            {state && !state.resolved && state.wrongOis.length > 0 && (
              <div className="pl-10 mt-3 text-[12.5px]" style={{ color: 'var(--gold)', fontFamily: 'var(--f-mono)' }}>
                Not quite — one attempt left.
              </div>
            )}
            {state?.resolved && state.gotCorrect && state.wrongOis.length === 0 && (
              <div className="pl-10 mt-3 text-[12.5px]" style={{ color: 'var(--jade)', fontFamily: 'var(--f-mono)' }}>
                ✓ Correct first try · scheduled further out.
              </div>
            )}
            {state?.resolved && state.gotCorrect && state.wrongOis.length > 0 && (
              <div className="pl-10 mt-3 text-[12.5px]" style={{ color: 'var(--gold)', fontFamily: 'var(--f-mono)' }}>
                ✓ Correct on second try · scheduled sooner for extra practice.
              </div>
            )}
            {state?.resolved && !state.gotCorrect && (
              <div className="pl-10 mt-3 text-[12.5px]" style={{ color: 'var(--accent)', fontFamily: 'var(--f-mono)' }}>
                ↺ {item.answer[0]} ({item.answer[1]}) — back to review soon.
              </div>
            )}
          </div>
        );
      })}

      {allDone && (
        <div className="mt-6 p-5 rounded-[14px] animate-rise" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
            Fill-in-blank results
          </div>
          <div className="flex gap-4 flex-wrap mb-6">
            {summary.good  > 0 && <div><span style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 500, color: 'var(--jade)' }}>{summary.good}</span><span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--jade)', marginLeft: 5 }}>first try</span></div>}
            {summary.hard  > 0 && <div><span style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 500, color: 'var(--gold)' }}>{summary.hard}</span><span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--gold)', marginLeft: 5 }}>second try</span></div>}
            {summary.again > 0 && <div><span style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 500, color: 'var(--accent)' }}>{summary.again}</span><span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--accent)', marginLeft: 5 }}>missed</span></div>}
          </div>
          <div className="flex justify-center">
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
