'use client';
import { useState, useCallback, useMemo, useEffect } from 'react';
import type { ResponseMode, FRResponse, DeckWord } from '@/lib/types';
import { getPassageData } from '@/lib/data/allPassages';
import { storage } from '@/lib/storage';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { fsrsNextInterval, fmtInterval, type FsrsGrade } from '@/lib/fsrs';
import { useWordPopup } from '@/hooks/useWordPopup';
import { useDailyContent } from '@/hooks/useDailyContent';
import ClickableWord from '@/components/shared/ClickableWord';
import WordPopup from './WordPopup';
import PassagePlayer from './PassagePlayer';
import PassageText from './PassageText';
import PassageSkeleton from './PassageSkeleton';
import LookupSummary from './LookupSummary';
import Question from './Question';
import VocabResults from './VocabResults';

interface Props {
  onScore: (score: number) => void;
  onNavigatePractice: () => void;
}

export default function ReadTab({ onScore, onNavigatePractice }: Props) {
  const { deck, addWord, updateWordReview } = useVocabDeck();

  // Load HSK level from prefs
  const [hskLevel, setHskLevel] = useState(0);
  useEffect(() => {
    storage.getPrefs().then(p => setHskLevel(p.hskLevel ?? 4));
  }, []);

  // Static passage data for this level (always loaded; used as fallback)
  const passageData = useMemo(() => getPassageData(hskLevel), [hskLevel]);

  // AI-generated daily content (null when unavailable → fall back to static)
  const { dailyContent, status: dailyStatus, regenerate } = useDailyContent(hskLevel, deck);

  // Passage navigation
  const numPassages = dailyContent?.passages.length ?? 0;
  const [passageIdx, setPassageIdx] = useState(0);

  // Current passage from daily content
  const currentPassage = dailyContent?.passages[passageIdx];

  // Active content: daily passage when ready, static otherwise
  const SENTENCES    = currentPassage?.sentences    ?? passageData.sentences;
  const TITLE_TOKENS = currentPassage?.titleTokens  ?? passageData.titleTokens;
  const QUESTIONS    = (currentPassage?.questions && currentPassage.questions.length >= 2)
    ? currentPassage.questions
    : passageData.questions;
  const charCount    = currentPassage
    ? currentPassage.sentences.flatMap(s => s.tokens).filter(t => /[一-鿿]/.test(t.text)).length
    : passageData.charCount;

  // Vocab set for review-word highlighting — current passage only
  const PASSAGE_VOCAB_SET = useMemo(
    () => currentPassage ? new Set(currentPassage.vocabWords) : passageData.vocabSet,
    [currentPassage, passageData.vocabSet]
  );

  // Total unique review words across ALL passages (for header)
  const totalReviewWordCount = useMemo(() => {
    if (!dailyContent) return 0;
    const all = new Set(dailyContent.passages.flatMap(p => p.vocabWords));
    return all.size;
  }, [dailyContent]);

  const deckWords = useMemo(() => new Set(deck.map(d => d.h)), [deck]);
  const targetWords = useMemo(
    () => deck.map(d => d.h).filter(h => PASSAGE_VOCAB_SET.has(h)),
    [deck, PASSAGE_VOCAB_SET]
  );
  const reviewWordCount = targetWords.length;

  const [activeSentence, setActiveSentence] = useState(0);
  const [audioOnly, setAudioOnly] = useState(false);
  const [responseMode, setResponseMode] = useState<ResponseMode>('fr');
  const [peeked, setPeeked] = useState<Set<string>>(new Set());
  const [frResponses, setFrResponses] = useState<Record<number, FRResponse>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [mcAnswered, _setMcAnswered] = useState<Record<number, 'right' | 'wrong'>>({});
  const [showResults, setShowResults] = useState(false);
  const [resultsBuilt, setResultsBuilt] = useState(false);
  const [vocabResults, setVocabResults] = useState<{ word: string; pinyin?: string; status: 'up' | 'down' | 'stable'; msg: string }[]>([]);

  // Reset reading state whenever the level changes
  useEffect(() => {
    setActiveSentence(0);
    setPassageIdx(0);
    setPeeked(new Set());
    setFrResponses({});
    setShowResults(false);
    setResultsBuilt(false);
    setVocabResults([]);
  }, [hskLevel]);

  // Also reset when daily content arrives
  useEffect(() => {
    setActiveSentence(0);
    setPassageIdx(0);
    setPeeked(new Set());
    setFrResponses({});
    setShowResults(false);
    setResultsBuilt(false);
    setVocabResults([]);
  }, [dailyContent]);

  // Reset reading state when switching passages
  const handlePassageChange = useCallback((delta: number) => {
    setPassageIdx(prev => Math.max(0, Math.min(prev + delta, numPassages - 1)));
    setActiveSentence(0);
    setPeeked(new Set());
    setFrResponses({});
    setShowResults(false);
    setResultsBuilt(false);
    setVocabResults([]);
  }, [numPassages]);

  // Title popup — pass deckWords so stale vocab claims are cleared when words are removed
  const titlePopup = useWordPopup((word, pinyin, meaning) => addWord({ h: word, p: pinyin, m: meaning }), deckWords);

  const handleAddVocabQuestion = useCallback((word: string, pinyin: string, meaning: string) => {
    addWord({ h: word, p: pinyin, m: meaning });
  }, [addWord]);

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
        // Peeked → Again (1), Recalled → Good (3), Not used → Hard (2)
        const grade: FsrsGrade = peeked.has(w) ? 1 : usedWords.has(w) ? 3 : 2;
        const days = deckWord ? fsrsNextInterval(deckWord, grade) : 1;
        const label = fmtInterval(days);
        if (peeked.has(w)) {
          return { word: w, pinyin: deckWord?.p, status: 'down' as const, msg: `Peeked — review in ${label}` };
        }
        if (usedWords.has(w)) {
          return { word: w, pinyin: deckWord?.p, status: 'up' as const, msg: `Recalled — next in ${label}` };
        }
        return { word: w, pinyin: deckWord?.p, status: 'stable' as const, msg: `Not used — next in ${label}` };
      });
      setVocabResults(rows);

      // Apply FSRS grades for every passage vocab word
      targetWords.forEach(w => {
        const grade: FsrsGrade = peeked.has(w) ? 1 : usedWords.has(w) ? 3 : 2;
        updateWordReview(w, grade);
      });

      const okCount =
        Object.values(frResponses).filter(r => r.verdict === 'ok').length +
        Object.values(mcAnswered).filter(v => v === 'right').length;
      const peekPenalty = Math.min(peeked.size * 8, 40);
      const score = Math.round(Math.max(0, (okCount / Math.max(QUESTIONS.length, 1)) * 100 - peekPenalty));
      onScore(score);
    }
    setShowResults(v => !v);
  }, [resultsBuilt, frResponses, mcAnswered, peeked, onScore, targetWords, deck, QUESTIONS, updateWordReview]);

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
      {/* Title row */}
      <div className="flex justify-between items-end mb-4 flex-wrap gap-2.5">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {numPassages > 1
              ? `Today's ${numPassages} passages · ${totalReviewWordCount} review word${totalReviewWordCount === 1 ? '' : 's'} total`
              : totalReviewWordCount > 0
                ? `Today's passage · ${totalReviewWordCount} review word${totalReviewWordCount === 1 ? '' : 's'}`
                : "Today's passage · add words to your deck to track them here"
            }
            {/* Status badge */}
            {dailyStatus === 'ready' && dailyContent && (
              <span style={{ fontSize: 9, letterSpacing: '.06em', background: 'var(--jade-soft)', color: 'var(--jade)', border: '1px solid color-mix(in srgb, var(--jade) 30%, transparent)', borderRadius: 4, padding: '1px 5px' }}>
                ✦ AI · {dailyContent.date}
              </span>
            )}
            {dailyStatus === 'loading' && (
              <span style={{ fontSize: 9, letterSpacing: '.06em', color: 'var(--ink-faint)', opacity: 0.6 }}>
                generating…
              </span>
            )}
            {(dailyStatus === 'error' || dailyStatus === 'no-key') && (
              <button
                onClick={regenerate}
                style={{ fontSize: 9, letterSpacing: '.06em', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontFamily: 'var(--f-mono)' }}
                title={dailyStatus === 'no-key' ? 'Add ANTHROPIC_API_KEY to .env.local' : 'Retry generation'}
              >
                {dailyStatus === 'no-key' ? '⚠ no API key' : '↺ retry'}
              </button>
            )}
          </div>
          {/* Clickable title */}
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, letterSpacing: '-.01em', marginTop: 4, minHeight: 36 }}>
            {hskLevel === 0 || dailyStatus === 'loading' ? (
              <div className="shimmer" style={{ height: 28, width: 140, borderRadius: 6, marginTop: 4 }} />
            ) : (
              <span style={{ fontFamily: 'var(--f-han)' }}>
                {TITLE_TOKENS.map((t, i) => {
                  const claimKind = (titlePopup.vocabClaimed.has(t.text) && deckWords.has(t.text)) ? 'vocab' as const
                    : titlePopup.tomorrowClaimed.has(t.text) ? 'tomorrow' as const
                    : null;
                  return <ClickableWord key={i} token={t} onOpen={titlePopup.openPopup} claimKind={claimKind} />;
                })}
              </span>
            )}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.05em' }}>
          level <span style={{ color: 'var(--jade)', fontWeight: 500 }}>HSK {hskLevel}</span> · ~{charCount} 字
        </div>
      </div>

      {/* Passage navigation — shown when there are multiple passages */}
      {numPassages > 1 && dailyStatus === 'ready' && (
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => handlePassageChange(-1)}
            disabled={passageIdx === 0}
            className="cursor-pointer transition-all duration-150 disabled:opacity-30 disabled:cursor-default"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', background: 'none', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 10px', color: 'var(--ink-soft)' }}
          >
            ← prev
          </button>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.08em' }}>
            passage <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{passageIdx + 1}</span> / {numPassages}
            {reviewWordCount > 0 && (
              <span style={{ marginLeft: 6, color: 'var(--jade)', fontWeight: 500 }}>· {reviewWordCount} word{reviewWordCount !== 1 ? 's' : ''}</span>
            )}
          </span>
          <button
            onClick={() => handlePassageChange(1)}
            disabled={passageIdx === numPassages - 1}
            className="cursor-pointer transition-all duration-150 disabled:opacity-30 disabled:cursor-default"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', background: 'none', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 10px', color: 'var(--ink-soft)' }}
          >
            next →
          </button>
        </div>
      )}

      {hskLevel === 0 || dailyStatus === 'loading' ? (
        <PassageSkeleton />
      ) : (
        <>
          {/* Controls row */}
          <div className="flex gap-2 items-center mb-4 flex-wrap">
            <PassagePlayer sentences={SENTENCES} onSentenceChange={setActiveSentence} />
            <div className="ml-auto flex gap-2 flex-wrap">
              <button style={toggleStyle(audioOnly)} onClick={() => setAudioOnly(v => !v)}>
                🎧 Audio only
              </button>
            </div>
          </div>

          {/* Passage */}
          <PassageText
            sentences={SENTENCES}
            activeSentenceIdx={activeSentence}
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
        </>
      )}

      <div className="h-px my-8" style={{ background: 'var(--line)' }} />

      {/* Questions header */}
      <div className="flex justify-between items-center flex-wrap gap-2.5 mb-4">
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Reading comprehension · {QUESTIONS.length} questions
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
            key={`${hskLevel}-${passageIdx}-${i}-${responseMode}`}
            question={q}
            index={i}
            mode={responseMode}
            savedResponse={frResponses[i]}
            onSave={r => setFrResponses(prev => ({ ...prev, [i]: r }))}
            onAddVocab={handleAddVocabQuestion}
            deckWords={deckWords}
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

      {/* Title popup */}
      <WordPopup
        data={titlePopup.popup}
        onClose={titlePopup.closePopup}
        onAddVocab={titlePopup.handleAddVocab}
        onLearnTomorrow={titlePopup.handleLearnTomorrow}
      />
    </div>
  );
}
