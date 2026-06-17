'use client';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { ResponseMode, FRResponse, DeckWord, ContentSection } from '@/lib/types';
import { getPassageData } from '@/lib/data/allPassages';
import { storage } from '@/lib/storage';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { fsrsNextInterval, fmtInterval, type FsrsGrade } from '@/lib/fsrs';
import { useWordPopup } from '@/hooks/useWordPopup';
import { useDailyContent } from '@/hooks/useDailyContent';
import { groupReadings } from '@/lib/readings';
import { buildAnchorMap, type Anchor } from '@/lib/anchors';
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

// Stable reference so the hook's effect dependency doesn't change every render.
const READ_WANT: ContentSection[] = ['passage'];

export default function ReadTab({ onScore, onNavigatePractice }: Props) {
  const { deck, addWord, updateWordReview, gradeCard } = useVocabDeck();

  // Load HSK level + selected study deck from prefs
  const [hskLevel, setHskLevel] = useState(0);
  const [studyDeck, setStudyDeck] = useState('');
  useEffect(() => {
    storage.getPrefs().then(p => { setHskLevel(p.hskLevel ?? 4); setStudyDeck(p.studyDeck ?? ''); });
  }, []);

  // Static passage data for this level (always loaded; used as fallback)
  const passageData = useMemo(() => getPassageData(hskLevel), [hskLevel]);

  // AI-generated daily content (null when unavailable → fall back to static)
  // Read only needs the passage block — fill/convo are generated lazily by ExtrasTab.
  const { dailyContent, status: dailyStatus, loadMore, loadingMore } = useDailyContent(hskLevel, deck, studyDeck, READ_WANT);

  // Passage navigation
  const numPassages = dailyContent?.passages.length ?? 0;
  const [passageIdx, setPassageIdx] = useState(0);

  // Current passage from daily content
  const currentPassage = dailyContent?.passages[passageIdx];

  // Active content: daily passage when ready, static otherwise
  const SENTENCES    = currentPassage?.sentences    ?? passageData.sentences;
  const TITLE_TOKENS = currentPassage?.titleTokens  ?? passageData.titleTokens;
  const QUESTIONS    = (currentPassage?.questions && currentPassage.questions.length >= 1)
    ? currentPassage.questions
    : passageData.questions;
  const charCount    = currentPassage
    ? currentPassage.sentences.flatMap(s => s.tokens).filter(t => /[一-鿿]/.test(t.text)).length
    : passageData.charCount;

  // Rough wall-clock estimate for AI generation, surfaced while the user waits so
  // the delay reads as expected, not broken. Higher HSK levels write longer
  // passages, so they take a little longer.
  const genEstShort = hskLevel <= 3 ? '~15–25s' : '~20–35s';
  const genEstLong  = hskLevel <= 3 ? 'about 15–25 seconds' : 'about 20–35 seconds';

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
  const deckReadings = useMemo(() => groupReadings(deck), [deck]);
  const targetWords = useMemo(
    () => deck.map(d => d.h).filter(h => PASSAGE_VOCAB_SET.has(h)),
    [deck, PASSAGE_VOCAB_SET]
  );

  // Compound-anchored polyphones: 银行 in the passage → the 行 háng card.
  const anchorMap = useMemo(() => buildAnchorMap(deck), [deck]);
  // Anchors whose compound actually appears in the current passage.
  const passageAnchors = useMemo(() => {
    const present = new Map<string, Anchor>();
    const toks = currentPassage?.sentences.flatMap(s => s.tokens) ?? [];
    for (const t of toks) {
      const a = anchorMap.get(t.text);
      if (a && !present.has(t.text)) present.set(t.text, a);
    }
    return present;
  }, [currentPassage, anchorMap]);

  // Pass anchor compounds to PassageText as review words so the whole word
  // (银行) highlights and tracks peeks — no mid-word single-char highlight.
  const passageDeckWords = useMemo(
    () => passageAnchors.size ? new Set([...deckWords, ...passageAnchors.keys()]) : deckWords,
    [deckWords, passageAnchors]
  );

  const reviewWordCount = targetWords.length + passageAnchors.size;

  const [activeSentence, setActiveSentence] = useState(0);
  const [audioOnly, setAudioOnly] = useState(false);
  const [responseMode, setResponseMode] = useState<ResponseMode>('fr');
  const [peeked, setPeeked] = useState<Set<string>>(new Set());
  const [frResponses, setFrResponses] = useState<Record<number, FRResponse>>({});
  const [mcGrades, setMcGrades] = useState<Record<number, FsrsGrade>>({});
  const [showResults, setShowResults] = useState(false);
  const [resultsBuilt, setResultsBuilt] = useState(false);
  const [vocabResults, setVocabResults] = useState<{ word: string; pinyin?: string; status: 'up' | 'down' | 'stable'; msg: string }[]>([]);

  // Reset reading state whenever the level changes
  useEffect(() => {
    setActiveSentence(0);
    setPassageIdx(0);
    setPeeked(new Set());
    setFrResponses({});
    setMcGrades({});
    setShowResults(false);
    setResultsBuilt(false);
    setVocabResults([]);
  }, [hskLevel]);

  // Reset only when a genuinely new day's content loads — keyed on content identity
  // (date/level/deck), NOT object reference. Appending a passage via loadMore or merging
  // a lazily-generated section keeps the same identity, so it won't snap back to passage 0
  // and fight the auto-navigate effect below.
  const contentKey = dailyContent
    ? `${dailyContent.date}|${dailyContent.hskLevel}|${dailyContent.deck ?? ''}`
    : '';
  useEffect(() => {
    setActiveSentence(0);
    setPassageIdx(0);
    setPeeked(new Set());
    setFrResponses({});
    setMcGrades({});
    setShowResults(false);
    setResultsBuilt(false);
    setVocabResults([]);
  }, [contentKey]);

  // When loadMore appends a passage, auto-navigate to it
  const prevNumPassages = useRef(numPassages);
  useEffect(() => {
    if (numPassages > prevNumPassages.current) {
      setPassageIdx(numPassages - 1);
      setActiveSentence(0);
      setPeeked(new Set());
      setFrResponses({});
      setMcGrades({});
      setShowResults(false);
      setResultsBuilt(false);
      setVocabResults([]);
    }
    prevNumPassages.current = numPassages;
  }, [numPassages]);

  // Reset reading state when switching passages
  const handlePassageChange = useCallback((delta: number) => {
    setPassageIdx(prev => Math.max(0, Math.min(prev + delta, numPassages - 1)));
    setActiveSentence(0);
    setPeeked(new Set());
    setFrResponses({});
    setMcGrades({});
    setShowResults(false);
    setResultsBuilt(false);
    setVocabResults([]);
  }, [numPassages]);

  // Title popup — pass deckWords so stale vocab claims are cleared when words are removed
  const titlePopup = useWordPopup((word, pinyin, meaning) => addWord({ h: word, p: pinyin, m: meaning }), deckWords, deckReadings);

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

      // Words used in free-response answers
      const frUsedWords = new Set<string>();
      Object.values(frResponses).forEach(r => {
        targetWords.forEach(w => { if (r.text.includes(w)) frUsedWords.add(w); });
      });

      // Best MC grade per key word across all MC questions
      // grade 3 = correct first try, 2 = correct second try, 1 = both wrong
      const mcWordGrades = new Map<string, FsrsGrade>();
      Object.entries(mcGrades).forEach(([qi, grade]) => {
        const question = QUESTIONS[+qi];
        if (!question) return;
        question.key.forEach(k => {
          if (!targetWords.includes(k)) return;
          const existing = mcWordGrades.get(k);
          if (existing === undefined || grade > existing) mcWordGrades.set(k, grade);
        });
      });

      // Per-word grade: peeked → 1, best of FR/MC (floor 2) otherwise
      const getWordGrade = (w: string): FsrsGrade => {
        if (peeked.has(w)) return 1;
        let best: FsrsGrade = 2; // Hard = "not clearly demonstrated"
        if (frUsedWords.has(w)) best = 3;
        const mcG = mcWordGrades.get(w);
        if (mcG !== undefined && mcG > best) best = mcG;
        return best;
      };

      const rows = targetWords.map(w => {
        const deckWord = deck.find(d => d.h === w);
        const grade = getWordGrade(w);
        const days = deckWord ? fsrsNextInterval(deckWord, grade) : 1;
        const label = fmtInterval(days);
        if (grade === 1) {
          return { word: w, pinyin: deckWord?.p, status: 'down' as const, msg: `Peeked — review in ${label}` };
        }
        if (grade === 3) {
          return { word: w, pinyin: deckWord?.p, status: 'up' as const, msg: `Recalled — next in ${label}` };
        }
        // grade === 2
        const inMc = mcWordGrades.has(w);
        const inFr = frUsedWords.has(w);
        if (inMc || inFr) {
          return { word: w, pinyin: deckWord?.p, status: 'stable' as const, msg: `Partially recalled — next in ${label}` };
        }
        return { word: w, pinyin: deckWord?.p, status: 'stable' as const, msg: `Not used — next in ${label}` };
      });
      // Anchor compounds (银行 → 行 háng card): grade the underlying reading card by id.
      const frTextAll = Object.values(frResponses).map(r => r.text).join(' ');
      const mcKeyRecalled = (word: string) =>
        Object.entries(mcGrades).some(([qi, g]) => g >= 2 && QUESTIONS[+qi]?.key.includes(word));
      const anchorGrade = (compound: string): FsrsGrade => {
        if (peeked.has(compound)) return 1;
        if (frTextAll.includes(compound) || mcKeyRecalled(compound)) return 3;
        return 2;
      };
      // Several compounds (银行, 同行) can map to the SAME reading card — grade each
      // card once, taking the most punishing grade (a peek on any = forgotten).
      const byCard = new Map<string, { anchor: Anchor; compounds: string[]; grade: FsrsGrade }>();
      passageAnchors.forEach((anchor, compound) => {
        const g = anchorGrade(compound);
        const cur = byCard.get(anchor.id);
        if (!cur) byCard.set(anchor.id, { anchor, compounds: [compound], grade: g });
        else { cur.compounds.push(compound); cur.grade = Math.min(cur.grade, g) as FsrsGrade; }
      });
      const anchorRows = [...byCard.values()].map(({ anchor, compounds, grade }) => {
        const card = deck.find(d => d.id === anchor.id);
        const days = card ? fsrsNextInterval(card, grade) : 1;
        const label = fmtInterval(days);
        const tag = `${anchor.hanzi} ${anchor.pinyin}`;
        const shown = compounds.join('、');
        if (grade === 1) return { word: shown, pinyin: anchor.pinyin, status: 'down' as const, msg: `Peeked (${tag}) — review in ${label}` };
        if (grade === 3) return { word: shown, pinyin: anchor.pinyin, status: 'up' as const, msg: `Recalled (${tag}) — next in ${label}` };
        return { word: shown, pinyin: anchor.pinyin, status: 'stable' as const, msg: `${tag} — next in ${label}` };
      });

      setVocabResults([...rows, ...anchorRows]);

      // Apply FSRS grades
      targetWords.forEach(w => updateWordReview(w, getWordGrade(w)));
      byCard.forEach(({ anchor, grade }) => gradeCard(anchor.id, grade));

      // Score: count questions answered correctly (FR ok, MC grade ≥ 2)
      const okCount =
        Object.values(frResponses).filter(r => r.verdict === 'ok').length +
        Object.values(mcGrades).filter(g => g >= 2).length;
      const peekPenalty = Math.min(peeked.size * 8, 40);
      const score = Math.round(Math.max(0, (okCount / Math.max(QUESTIONS.length, 1)) * 100 - peekPenalty));
      onScore(score);
    }
    setShowResults(v => !v);
  }, [resultsBuilt, frResponses, mcGrades, peeked, onScore, targetWords, deck, QUESTIONS, updateWordReview, passageAnchors, gradeCard]);

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
      <div className="flex justify-between items-end mb-2 flex-wrap gap-2.5">
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
                generating… {genEstShort}
              </span>
            )}
            {dailyStatus === 'no-key' && (
              <span style={{ fontSize: 9, letterSpacing: '.06em', color: 'var(--accent)', fontFamily: 'var(--f-mono)' }}>
                ⚠ no API key
              </span>
            )}
            {dailyStatus === 'error' && (
              <span style={{ fontSize: 9, letterSpacing: '.06em', color: 'var(--accent)', fontFamily: 'var(--f-mono)' }}>
                ⚠ generation failed
              </span>
            )}
          </div>
          {/* Clickable title */}
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, letterSpacing: '-.01em', marginTop: 4 }}>
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

      {/* Passage navigation — only shown when there are multiple passages */}
      {dailyStatus === 'ready' && numPassages > 1 && (
        <div className="flex items-center gap-3 mb-2 flex-wrap">
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
        <>
          {dailyStatus === 'loading' && (
            <p style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--ink-faint)', lineHeight: 1.5, marginBottom: 16 }}>
              Writing today&apos;s passage around your due words — this usually takes {genEstLong}.
            </p>
          )}
          <PassageSkeleton />
        </>
      ) : (
        <>
          {/* Controls row */}
          <div className="flex gap-2 items-center mb-4 flex-wrap">
            <PassagePlayer sentences={SENTENCES} onSentenceChange={setActiveSentence} />
            <div className="ml-auto flex gap-2 items-center flex-wrap">
              {(dailyStatus === 'ready' || dailyStatus === 'error') && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-default"
                  style={{
                    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em',
                    background: 'none', border: '1px solid var(--line)', borderRadius: 8,
                    padding: '9px 15px', color: loadingMore ? 'var(--ink-faint)' : 'var(--ink-soft)',
                  }}
                >
                  {loadingMore ? `generating… ${genEstShort}` : '+ new passage'}
                </button>
              )}
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
            deckWords={passageDeckWords}
            deckReadings={deckReadings}
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

      {/* Don't render questions until the passage is ready — avoids static
          fallback questions flashing while the AI passage is still generating */}
      {dailyStatus === 'loading' && (
        <div className="mt-8 pt-8" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="shimmer" style={{ height: 14, width: 180, borderRadius: 4, marginBottom: 22 }} />
          <div className="shimmer" style={{ height: 96, borderRadius: 10, marginBottom: 14 }} />
          <div className="shimmer" style={{ height: 96, borderRadius: 10, marginBottom: 14 }} />
          <div className="shimmer" style={{ height: 96, borderRadius: 10 }} />
        </div>
      )}

      {dailyStatus !== 'loading' && (
      <>
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
            hskLevel={hskLevel}
            savedResponse={frResponses[i]}
            onSave={r => setFrResponses(prev => ({ ...prev, [i]: r }))}
            onAddVocab={handleAddVocabQuestion}
            deckWords={deckWords}
            deckReadings={deckReadings}
            onMcGrade={(qi, grade) => setMcGrades(prev => ({ ...prev, [qi]: grade }))}
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
      </>
      )}

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
