'use client';
import { useState, useCallback } from 'react';
import type { ResponseMode, FRResponse } from '@/lib/types';
import { SENTENCES } from '@/lib/data/passage';
import { QUESTIONS } from '@/lib/data/questions';
import { DEFAULT_DECK } from '@/lib/data/deck';
import PassagePlayer from './PassagePlayer';
import PassageText from './PassageText';
import LookupSummary from './LookupSummary';
import Question from './Question';
import VocabResults from './VocabResults';

const TARGET_WORDS = DEFAULT_DECK.map(d => d.h);
const TOTAL_VOCAB_IN_PASSAGE = new Set(
  SENTENCES.flatMap(s => s.tokens.filter(t => t.type === 'vocab').map(t => t.text))
).size;

interface Props {
  onScore: (score: number) => void;
  onNavigatePractice: () => void;
}

export default function ReadTab({ onScore, onNavigatePractice }: Props) {
  const [activeSentence, setActiveSentence] = useState(0);
  const [showPinyin, setShowPinyin] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [responseMode, setResponseMode] = useState<ResponseMode>('fr');
  const [peeked, setPeeked] = useState<Set<string>>(new Set());
  const [frResponses, setFrResponses] = useState<Record<number, FRResponse>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [mcAnswered, _setMcAnswered] = useState<Record<number, 'right' | 'wrong'>>({});
  const [showResults, setShowResults] = useState(false);
  const [resultsBuilt, setResultsBuilt] = useState(false);
  const [vocabResults, setVocabResults] = useState<{ word: string; status: 'up' | 'down' | 'stable'; msg: string }[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [claimedCount, _setClaimedCount] = useState(0);

  const handlePeek = useCallback((word: string) => {
    setPeeked(prev => new Set([...prev, word]));
  }, []);

  const toggleResults = useCallback(() => {
    if (!resultsBuilt) {
      setResultsBuilt(true);
      const usedWords = new Set<string>();
      Object.values(frResponses).forEach(r => {
        TARGET_WORDS.forEach(w => { if (r.text.includes(w)) usedWords.add(w); });
      });
      Object.entries(mcAnswered).forEach(([i, ok]) => {
        if (ok === 'right') {
          QUESTIONS[+i].key.forEach(k => { if (TARGET_WORDS.includes(k)) usedWords.add(k); });
        }
      });
      const rows = TARGET_WORDS.map(w => {
        if (peeked.has(w)) return { word: w, status: 'down' as const, msg: 'Peeked — back to tomorrow' };
        if (usedWords.has(w)) return { word: w, status: 'up' as const, msg: 'Recalled in your answer · +3 days' };
        return { word: w, status: 'stable' as const, msg: 'Not used this session · holds' };
      });
      setVocabResults(rows);

      const okCount =
        Object.values(frResponses).filter(r => r.verdict === 'ok').length +
        Object.values(mcAnswered).filter(v => v === 'right').length;
      const peekPenalty = Math.min(peeked.size * 8, 40);
      const score = Math.round(Math.max(0, (okCount / Math.max(QUESTIONS.length, 1)) * 100 - peekPenalty));
      onScore(score);
    }
    setShowResults(v => !v);
  }, [resultsBuilt, frResponses, mcAnswered, peeked, onScore]);

  const toggleStyle = (on: boolean) => ({
    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' as const,
    background: on ? 'var(--ink)' : 'var(--card)',
    color: on ? 'var(--paper)' : 'var(--ink-soft)',
    border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
    borderRadius: 8, padding: '9px 15px', cursor: 'pointer', transition: 'all .15s',
    display: 'inline-flex', alignItems: 'center', gap: 7,
  });

  return (
    <div
      className="rounded-tr-xl rounded-b-xl px-9 py-8 animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
      {/* Title */}
      <div className="flex justify-between items-end mb-4 flex-wrap gap-2.5">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Today&apos;s passage · built from 8 review words
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, letterSpacing: '-.01em', marginTop: 4 }}>
            城市里的<span style={{ fontFamily: 'var(--f-han)' }}>环境</span>
          </div>
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.05em' }}>
          level <span style={{ color: 'var(--jade)', fontWeight: 500 }}>HSK 4</span> · ~120 字
        </div>
      </div>

      {/* Controls row */}
      <div className="flex gap-2 items-center mb-4 flex-wrap">
        <PassagePlayer sentences={SENTENCES} onSentenceChange={setActiveSentence} />
        <div className="ml-auto flex gap-2 flex-wrap">
          <button style={toggleStyle(audioOnly)} onClick={() => setAudioOnly(v => !v)}>
            🎧 Audio only
          </button>
          <button style={toggleStyle(showPinyin)} onClick={() => setShowPinyin(v => !v)}>
            <span style={{ fontFamily: 'var(--f-han)', fontSize: 13 }}>拼</span> Pinyin
          </button>
        </div>
      </div>

      {/* Passage */}
      <PassageText
        sentences={SENTENCES}
        activeSentenceIdx={activeSentence}
        showPinyin={showPinyin}
        audioOnly={audioOnly}
        peeked={peeked}
        onPeek={handlePeek}
      />

      {/* Lookup summary */}
      <LookupSummary
        peekedCount={peeked.size}
        totalVocab={TOTAL_VOCAB_IN_PASSAGE}
        claimedCount={claimedCount}
      />

      <div className="h-px my-8" style={{ background: 'var(--line)' }} />

      {/* Questions header */}
      <div className="flex justify-between items-center flex-wrap gap-2.5 mb-4">
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Reading comprehension · 5 questions
        </span>
        <div className="flex gap-1.5">
          <button style={toggleStyle(responseMode === 'fr')} onClick={() => setResponseMode('fr')}>Free response</button>
          <button style={toggleStyle(responseMode === 'mc')} onClick={() => setResponseMode('mc')}>Multiple choice</button>
        </div>
      </div>

      {/* Questions */}
      <div>
        {QUESTIONS.map((q, i) => (
          <Question
            key={`${i}-${responseMode}`}
            question={q}
            index={i}
            mode={responseMode}
            showPinyin={showPinyin}
            savedResponse={frResponses[i]}
            onSave={r => setFrResponses(prev => ({ ...prev, [i]: r }))}
          />
        ))}
      </div>

      {/* CTA row */}
      <div className="flex gap-2.5 justify-center flex-wrap mt-8 pt-6" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <button
          onClick={toggleResults}
          className="flex items-center gap-2 cursor-pointer transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)',
          }}
        >
          {showResults ? 'Hide vocabulary results' : 'Finish & see vocabulary results'}
        </button>
        <button
          onClick={onNavigatePractice}
          className="flex items-center gap-2 cursor-pointer transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
            background: 'none', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8,
            padding: '12px 20px',
          }}
        >
          Continue practicing
        </button>
      </div>

      {/* Vocab results */}
      {showResults && <VocabResults results={vocabResults} />}

      <div className="text-center mt-6 text-xs" style={{ color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', letterSpacing: '.04em' }}>
        Recall first · tap only when stuck — every lookup resets that word
      </div>
    </div>
  );
}
