'use client';
import { useState } from 'react';
import type { Question as Q, FRResponse, ResponseMode } from '@/lib/types';
import type { FsrsGrade } from '@/lib/fsrs';
import { speak } from '@/lib/speech';
import ClickableWord from '@/components/shared/ClickableWord';
import WordPopup from './WordPopup';
import { useWordPopup } from '@/hooks/useWordPopup';
import type { ReadingHint } from '@/lib/readings';

interface Props {
  question: Q;
  index: number;
  mode: ResponseMode;
  hskLevel?: number;
  savedResponse?: FRResponse;
  onSave: (r: FRResponse) => void;
  onAddVocab: (word: string, pinyin: string, meaning: string) => void;
  deckWords?: Set<string>;
  deckReadings?: Map<string, ReadingHint[]>;
  /** Called when MC is fully resolved — grade: 3=Good(1st try), 2=Hard(2nd try), 1=Again(both wrong) */
  onMcGrade?: (questionIdx: number, grade: FsrsGrade) => void;
}

export default function QuestionComponent({ question, index, mode, hskLevel = 4, savedResponse, onSave, onAddVocab, deckWords, deckReadings, onMcGrade }: Props) {
  // MC state
  const [mcTries, setMcTries]           = useState(0);          // 0 = untouched, 1 = one wrong try, 2 = done
  const [mcDone, setMcDone]             = useState(false);
  const [mcRight, setMcRight]           = useState<boolean | null>(null);
  const [selectedOi, setSelectedOi]     = useState<number | null>(null);  // last selected index
  const [firstWrongOi, setFirstWrongOi] = useState<number | null>(null);  // first wrong pick

  // FR state
  const [frText, setFrText]         = useState(savedResponse?.text || '');
  const [frFeedback, setFrFeedback] = useState<FRResponse | null>(savedResponse || null);
  const [loading, setLoading]       = useState(false);

  const { popup, openPopup, closePopup, handleAddVocab, handleLearnTomorrow, vocabClaimed, tomorrowClaimed } = useWordPopup(onAddVocab, deckWords, deckReadings);
  const claimKind = (text: string) =>
    (vocabClaimed.has(text) && deckWords?.has(text)) ? 'vocab' as const
    : tomorrowClaimed.has(text) ? 'tomorrow' as const
    : null;

  const questionText = question.q.map(t => t.text).join('');

  // ─── MC handler ────────────────────────────────────────────────────────────
  function handleMcClick(oi: number, isCorrect: boolean) {
    if (mcDone) return;
    setSelectedOi(oi);

    if (isCorrect) {
      // Correct answer
      const grade: FsrsGrade = mcTries === 0 ? 3 : 2; // Good on first try, Hard on second
      setMcDone(true);
      setMcRight(true);
      onMcGrade?.(index, grade);
    } else {
      // Wrong answer
      if (mcTries === 0) {
        // First wrong — show error, allow one more try
        setFirstWrongOi(oi);
        setMcTries(1);
      } else {
        // Second wrong — reveal and lock
        setMcDone(true);
        setMcRight(false);
        onMcGrade?.(index, 1); // Again
      }
    }
  }

  // ─── FR handler ────────────────────────────────────────────────────────────
  async function submitFR() {
    const text = frText.trim();
    if (!text) return;
    setLoading(true);

    try {
      const res = await fetch('/api/grade-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          model: question.model,
          key: question.key,
          response: text,
          hskLevel,
        }),
      });
      const data = await res.json();
      const result: FRResponse = {
        text,
        verdict: data.verdict ?? 'miss',
        message: data.message ?? 'Could not evaluate — try again.',
        wordsHit: Array.isArray(data.wordsHit) ? data.wordsHit : [],
      };
      setFrFeedback(result);
      onSave(result);
    } catch {
      // Network failure — fall back to local keyword match
      const wordsHit = question.key.filter(k => text.includes(k));
      const ratio = wordsHit.length / Math.max(question.key.length, 1);
      const verdict: FRResponse['verdict'] = ratio >= 0.66 ? 'ok' : ratio >= 0.34 ? 'partial' : 'miss';
      const message = ratio >= 0.66
        ? `Good — you used the key ideas (${wordsHit.join('、')}).`
        : ratio >= 0.34
          ? `Partially there — try also mentioning ${question.key.filter(k => !text.includes(k)).slice(0, 2).join('、')}.`
          : text.length < 4
            ? "Too short — write a full sentence."
            : `Reread the passage — focus on ${question.key.slice(0, 2).join('、')}.`;
      const result: FRResponse = { text, verdict, message, wordsHit };
      setFrFeedback(result);
      onSave(result);
    } finally {
      setLoading(false);
    }
  }

  const verdictColor = frFeedback?.verdict === 'ok' ? 'var(--jade)' : frFeedback?.verdict === 'partial' ? 'var(--gold)' : 'var(--accent)';
  const verdictLabel = frFeedback?.verdict === 'ok' ? 'On the mark' : frFeedback?.verdict === 'partial' ? 'Mostly there' : 'Needs another look';

  return (
    <div className="mb-8 pb-6" style={{ borderBottom: '1px dashed var(--line-soft)' }}>
      {/* Question text */}
      <div className="flex items-start gap-3 mb-3">
        <button
          onClick={() => speak(questionText)}
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 mt-1"
          style={{ border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)' }}
          title="Play audio"
        >
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/>
          </svg>
        </button>
        <div style={{ fontFamily: 'var(--f-han)', fontSize: 18, lineHeight: 1.7, fontWeight: 'var(--han-weight)' as 'bold' }}>
          <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--accent)', marginRight: 8, fontSize: 14, fontWeight: 500 }}>
            {index + 1}.
          </span>
          {question.q.map((t, i) => (
            <ClickableWord key={i} token={t} onOpen={openPopup} claimKind={claimKind(t.text)} />
          ))}
        </div>
      </div>

      {/* Multiple choice */}
      {mode === 'mc' && (
        <div className="flex flex-col gap-2 pl-10">
          {question.options.map((opt, oi) => {
            const isFirstWrong    = firstWrongOi === oi && !mcDone;
            const showCorrect     = mcDone && opt.correct;
            const showWrong       = mcDone && !opt.correct && (selectedOi === oi || firstWrongOi === oi);
            const showFirstWrong  = isFirstWrong;
            const isDisabled      = mcDone || (mcTries === 1 && oi === firstWrongOi);

            let borderColor = 'var(--line)';
            let bgColor = 'var(--paper-2)';
            let textColor = 'var(--ink)';
            let radioColor = 'transparent';
            let radioBorder = 'var(--line)';

            if (showCorrect) {
              borderColor = 'var(--jade)'; bgColor = 'var(--jade-soft)'; textColor = 'var(--jade)';
              radioColor = 'var(--jade)'; radioBorder = 'var(--jade)';
            } else if (showWrong || showFirstWrong) {
              borderColor = 'var(--accent)'; bgColor = 'var(--accent-soft)'; textColor = 'var(--accent)';
              radioColor = 'var(--accent)'; radioBorder = 'var(--accent)';
            }

            return (
              <div key={oi} className="flex items-center gap-3">
                <button
                  onClick={() => handleMcClick(oi, opt.correct)}
                  disabled={isDisabled}
                  className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer disabled:cursor-default"
                  style={{ border: `2px solid ${radioBorder}`, background: radioColor, flexShrink: 0 }}
                >
                  {showCorrect && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                  {(showWrong || showFirstWrong) && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✗</span>}
                </button>

                <div
                  className="flex-1 rounded-[9px] px-4 py-3"
                  style={{
                    fontFamily: 'var(--f-han)', fontSize: 16, lineHeight: 1.7,
                    fontWeight: 'var(--han-weight)' as 'bold',
                    background: bgColor, border: `1px solid ${borderColor}`, color: textColor,
                    opacity: (isDisabled && !showCorrect && !showWrong && !showFirstWrong) ? 0.4 : 1,
                    transition: 'all .15s',
                  }}
                >
                  {opt.tokens.map((t, ti) => (
                    <ClickableWord key={ti} token={t} onOpen={openPopup} claimKind={claimKind(t.text)} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Status message */}
          {mcTries === 1 && !mcDone && (
            <div className="pl-8 mt-1 text-[12px]" style={{ color: 'var(--accent)', fontFamily: 'var(--f-mono)', letterSpacing: '.04em' }}>
              Not quite — one more try.
            </div>
          )}
          {mcDone && mcRight !== null && (
            <div className="pl-8 mt-1 text-[12px]" style={{ color: mcRight ? 'var(--jade)' : 'var(--accent)', fontFamily: 'var(--f-mono)' }}>
              {mcRight
                ? (mcTries === 0 ? 'Correct first try.' : 'Correct on second try.')
                : 'Incorrect — correct answer is highlighted.'}
            </div>
          )}
        </div>
      )}

      {/* Free response */}
      {mode === 'fr' && (
        <div className="pl-10 flex flex-col gap-2">
          <textarea
            value={frText}
            onChange={e => setFrText(e.target.value)}
            placeholder="Write your answer in Chinese — full sentences, your own words."
            className="w-full rounded-[10px] px-4 py-3 resize-y transition-all duration-150"
            style={{
              fontFamily: 'var(--f-han)', fontSize: 16, minHeight: 74,
              background: 'var(--paper-2)', border: '1px solid var(--line)',
              color: 'var(--ink)', lineHeight: 1.6,
              fontWeight: 'var(--han-weight)' as 'bold',
              outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.background = 'var(--card)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--line)'; e.target.style.background = 'var(--paper-2)'; }}
          />
          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={submitFR}
              disabled={loading || !frText.trim()}
              className="cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
                background: 'var(--ink)', color: 'var(--paper)', border: 'none',
                borderRadius: 8, padding: '10px 18px',
              }}
            >
              {loading ? 'Evaluating…' : frFeedback ? 'Resubmit' : 'Submit for feedback'}
            </button>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.05em' }}>
              Try to use today&apos;s vocabulary
            </span>
          </div>

          {frFeedback && (
            <div
              className="mt-1 p-4 rounded-[10px] animate-rise"
              style={{
                background: 'var(--card)', border: '1px solid var(--line)',
                borderLeft: `3px solid ${verdictColor}`, fontSize: 14, lineHeight: 1.6, color: 'var(--ink)',
              }}
            >
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: verdictColor, marginBottom: 6, fontWeight: 600 }}>
                {verdictLabel}
              </div>
              {frFeedback.message}
              {frFeedback.wordsHit.length > 0 && (
                <div className="mt-2">
                  Used:{' '}
                  {frFeedback.wordsHit.map(w => (
                    <span key={w} className="inline-block rounded-full mr-1 mb-1 px-2 py-0.5" style={{ fontFamily: 'var(--f-han)', fontSize: 13, background: 'var(--jade-soft)', color: 'var(--jade)', fontWeight: 'var(--han-weight)' as 'bold' }}>
                      {w}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
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
