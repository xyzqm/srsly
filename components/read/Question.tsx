'use client';
import { useState } from 'react';
import type { Question as Q, FRResponse, ResponseMode, PassageToken } from '@/lib/types';
import { speak } from '@/lib/speech';

function renderTokens(tokens: PassageToken[], showPinyin: boolean) {
  return tokens.map((t, i) => {
    if (!t.pinyin) return <span key={i}>{t.text}</span>;
    return (
      <ruby key={i}>
        {t.text}
        {showPinyin && <rt>{t.pinyin}</rt>}
      </ruby>
    );
  });
}

interface Props {
  question: Q;
  index: number;
  mode: ResponseMode;
  showPinyin: boolean;
  savedResponse?: FRResponse;
  onSave: (r: FRResponse) => void;
}

export default function QuestionComponent({ question, index, mode, showPinyin, savedResponse, onSave }: Props) {
  const [mcDone, setMcDone] = useState(false);
  const [mcRight, setMcRight] = useState<boolean | null>(null);
  const [frText, setFrText] = useState(savedResponse?.text || '');
  const [frFeedback, setFrFeedback] = useState<FRResponse | null>(savedResponse || null);
  const [loading, setLoading] = useState(false);

  const questionText = question.q.map(t => t.text).join('');

  async function submitFR() {
    const text = frText.trim();
    if (!text) return;
    setLoading(true);
    const wordsHit = question.key.filter(k => text.includes(k));
    const ratio = wordsHit.length / Math.max(question.key.length, 1);
    let verdict: FRResponse['verdict'];
    let message: string;
    const missed = question.key.filter(k => !text.includes(k));

    if (ratio >= 0.66) {
      verdict = 'ok';
      message = `You captured the main idea — "${wordsHit.join('、')}" all land the point. Good Chinese.`;
    } else if (ratio >= 0.34) {
      verdict = 'partial';
      message = `You touched part of the answer. Try also mentioning ${missed.slice(0, 2).join('、')}.`;
    } else if (text.length < 4) {
      verdict = 'miss';
      message = "Too short — try a full sentence using a couple of today's words.";
    } else {
      verdict = 'miss';
      message = `Reread the passage — the key idea uses words like ${question.key.slice(0, 2).join('、')}.`;
    }

    const result: FRResponse = { text, verdict, message, wordsHit };
    setFrFeedback(result);
    onSave(result);
    setLoading(false);
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
          {renderTokens(question.q, showPinyin)}
        </div>
      </div>

      {/* Multiple choice */}
      {mode === 'mc' && (
        <div className="flex flex-col gap-2 pl-10">
          {question.options.map((opt, oi) => {
            const isSelected = mcDone;
            const showCorrect = isSelected && opt.correct;
            const showWrong = isSelected && !opt.correct && mcRight === false;
            return (
              <div key={oi} className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (mcDone) return;
                    setMcDone(true);
                    setMcRight(opt.correct);
                  }}
                  disabled={mcDone}
                  className="flex-1 text-left rounded-[9px] px-4 py-3 cursor-pointer transition-all duration-150 disabled:cursor-default"
                  style={{
                    fontFamily: 'var(--f-han)', fontSize: 16, lineHeight: 1.7,
                    fontWeight: 'var(--han-weight)' as 'bold',
                    background: showCorrect ? 'var(--jade-soft)' : showWrong ? 'var(--accent-soft)' : 'var(--paper-2)',
                    border: showCorrect ? '1px solid var(--jade)' : showWrong ? '1px solid var(--accent)' : '1px solid var(--line)',
                    color: showCorrect ? 'var(--jade)' : showWrong ? 'var(--accent)' : 'var(--ink)',
                  }}
                >
                  {renderTokens(opt.tokens, showPinyin)}
                  {showCorrect && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, float: 'right' }}>✓</span>}
                  {showWrong && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, float: 'right' }}>✗</span>}
                </button>
              </div>
            );
          })}
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
    </div>
  );
}
