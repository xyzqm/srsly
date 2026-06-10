'use client';
import { useState, useCallback, useMemo } from 'react';
import type { ResponseMode, FRResponse, DeckWord } from '@/lib/types';
import { SENTENCES } from '@/lib/data/passage';
import { QUESTIONS } from '@/lib/data/questions';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import PassagePlayer from './PassagePlayer';
import PassageText from './PassageText';
import LookupSummary from './LookupSummary';
import Question from './Question';
import VocabResults from './VocabResults';

// All vocab-type token texts in the passage (static)
const PASSAGE_VOCAB_SET = new Set(
  SENTENCES.flatMap(s => s.tokens.filter(t => t.type === 'vocab').map(t => t.text))
);

interface Props {
  onScore: (score: number) => void;
  onNavigatePractice: () => void;
}

export default function ReadTab({ onScore, onNavigatePractice }: Props) {
  const { deck, addWord } = useVocabDeck();
  const deckWords = useMemo(() => new Set(deck.map(d => d.h)), [deck]);
  // Words that are both in the user's deck and appear as vocab tokens in the passage
  const targetWords = useMemo(
    () => deck.map(d => d.h).filter(h => PASSAGE_VOCAB_SET.has(h)),
    [deck]
  );
  const reviewWordCount = targetWords.length;

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
  const [vocabResults, setVocabResults] = useState<{ word: string; pinyin?: string; status: 'up' | 'down' | 'stable'; msg: string }[]>([]);

  const handlePeek = useCallback((word: string) => {
    setPeeked(prev => new Set([...prev, word]));
  }, []);

  const handleAddToDeck = useCallback((word: DeckWord) => {
    addWord(word);
  }, [addWord]);

  const toggleResults = useCallback(() => {
    if (!resultsBuilt) {
      setResultsBuilt(true);
      const usedWords = new Set<string>();
      Object.values(frResponses).forEach(r => {
        targetWords.forEach(w => { if (r.text.includes(w)) usedWords.add(w); });
      });
      Object.entries(mcAnswered).forEach(([i, ok]) => {
        if (ok === 'right') {
          QUESTIONS[+i].key.forEach(k => { if (targetWords.includes(k)) usedWords.add(k); });
        }
      });
      const rows = targetWords.map(w => {
        const deckWord = deck.find(d => d.h === w);
        if (peeked.has(w)) return { word: w, pinyin: deckWord?.p, status: 'down' as const, msg: 'Peeked — back to tomorrow' };
        if (usedWords.has(w)) return { word: w, pinyin: deckWord?.p, status: 'up' as const, msg: 'Recalled in your answer · +3 days' };
        return { word: w, pinyin: deckWord?.p, status: 'stable' as const, msg: 'Not used this session · holds' };
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
  }, [resultsBuilt, frResponses, mcAnswered, peeked, onScore, targetWords, deck]);

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
            {reviewWordCount > 0
              ? `Today's passage · ${reviewWordCount} review word${reviewWordCount === 1 ? '' : 's'}`
              : "Today's passage · add words to your deck to track them here"}
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
        deckWords={deckWords}
        onAddToDeck={handleAddToDeck}
      />

      {/* Lookup summary */}
      <LookupSummary
        peekedCount={peeked.size}
        totalVocab={reviewWordCount}
        claimedCount={0}
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
    </div>
  );
}
