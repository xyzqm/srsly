'use client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { ResponseMode, FRResponse, DeckWord, ContentSection } from '@/lib/types';
import { getPassageData } from '@/lib/data/allPassages';
import { storage } from '@/lib/storage';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { fsrsNextInterval, fmtInterval, type FsrsGrade } from '@/lib/fsrs';
import { useWordPopup } from '@/hooks/useWordPopup';
import { useClaims } from '@/hooks/useClaims';
import { useDailyContent } from '@/hooks/useDailyContent';
import { groupReadings } from '@/lib/readings';
import { dateInDays, isDueToday, todayStr } from '@/lib/deck';
import { buildAnchorMap, type Anchor } from '@/lib/anchors';
import ClickableWord from '@/components/shared/ClickableWord';
import DeckSelector from '@/components/shared/DeckSelector';
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
  onRequireSignIn?: (reason?: string) => void;
}

const READ_WANT: ContentSection[] = ['passage'];

const GUEST_LIMIT_PROMPT = "You've used your free AI generations. Sign in for unlimited AI-generated passages and to sync your progress across devices.";

// Remembers which passage you were viewing, per day's content, so leaving and returning
// to the Read tab (or reloading) lands you back on the same passage. Keyed by content
// identity, so a new day / deck still starts fresh.
const passageIdxKey = (contentKey: string) => `srsly-read-pidx|${contentKey}`;
function readSavedPassageIdx(contentKey: string): number {
  if (!contentKey || typeof sessionStorage === 'undefined') return 0;
  const n = parseInt(sessionStorage.getItem(passageIdxKey(contentKey)) ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function ReadTab({ onScore, onNavigatePractice, onRequireSignIn }: Props) {
  const { signedIn } = useAuth();
  const { deck, addWord, updateWordReview, gradeCard } = useVocabDeck();

  const [hskLevel, setHskLevel] = useState(0);
  // Multi-deck study selection (shared across learning modes via prefs). [] = all decks.
  const [studyDecks, setStudyDecks] = useState<string[]>([]);
  const [customDecks, setCustomDecks] = useState<string[]>([]);
  useEffect(() => {
    storage.getPrefs().then(p => {
      setHskLevel(p.hskLevel ?? 4);
      setStudyDecks(p.studyDecks ?? (p.studyDeck ? [p.studyDeck] : []));
      setCustomDecks(p.decks ?? []);
    });
  }, []);
  const changeStudyDecks = useCallback((next: string[]) => {
    setStudyDecks(next);
    storage.getPrefs().then(p => storage.savePrefs({ ...p, studyDecks: next.length ? next : undefined }));
  }, []);

  const passageData = useMemo(() => getPassageData(hskLevel), [hskLevel]);

  const { dailyContent, status: dailyStatus, loadMore, loadingMore, guestLimited } = useDailyContent(hskLevel, deck, studyDecks, READ_WANT);

  // The guest AI cap only applies to guests. A signed-in user is unlimited (the server
  // never returns 402 for them), so even if `guestLimited` lingered from a pre-sign-in
  // 402 we must never show the banner or auto-prompt them.
  const showGuestLimit = guestLimited && !signedIn;

  // Automatically surface the sign-in modal when a guest hits the limit budget.
  useEffect(() => {
    if (showGuestLimit && onRequireSignIn) {
      onRequireSignIn(GUEST_LIMIT_PROMPT);
    }
  }, [showGuestLimit, onRequireSignIn]);

  const numPassages = dailyContent?.passages.length ?? 0;
  const [passageIdx, setPassageIdx] = useState(0);
  // Latest passage count, readable inside effects that shouldn't re-run on every change.
  const numPassagesRef = useRef(numPassages);
  numPassagesRef.current = numPassages;

  const currentPassage = dailyContent?.passages[passageIdx];

  const SENTENCES    = currentPassage?.sentences    ?? passageData.sentences;
  const TITLE_TOKENS = currentPassage?.titleTokens  ?? passageData.titleTokens;
  const QUESTIONS    = (currentPassage?.questions && currentPassage.questions.length >= 1)
    ? currentPassage.questions
    : passageData.questions;
  const charCount    = currentPassage
    ? currentPassage.sentences.flatMap(s => s.tokens).filter(t => /[一-鿿]/.test(t.text)).length
    : passageData.charCount;

  const genEstShort = hskLevel <= 3 ? '~15–25s' : '~20–35s';
  const genEstLong  = hskLevel <= 3 ? 'about 15–25 seconds' : 'about 20–35 seconds';

  const PASSAGE_VOCAB_SET = useMemo(
    () => currentPassage ? new Set(currentPassage.vocabWords) : passageData.vocabSet,
    [currentPassage, passageData.vocabSet]
  );

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

  const anchorMap = useMemo(() => buildAnchorMap(deck), [deck]);
  const passageAnchors = useMemo(() => {
    const present = new Map<string, Anchor>();
    const toks = currentPassage?.sentences.flatMap(s => s.tokens) ?? [];
    for (const t of toks) {
      const a = anchorMap.get(t.text);
      if (a && !present.has(t.text)) present.set(t.text, a);
    }
    return present;
  }, [currentPassage, anchorMap]);

  const passageDeckWords = useMemo(
    () => passageAnchors.size ? new Set([...deckWords, ...passageAnchors.keys()]) : deckWords,
    [deckWords, passageAnchors]
  );

  // Visual state of each deck word, derived from its SCHEDULING (not session clicks) so it
  // survives reloads and only flips on the actual due day:
  //   due now  → accent underline (a review word)
  //   pending  → green '+' (added but not yet due, e.g. "due tomorrow"; a brand-new card)
  // Keyed by the hanzi/compound as it appears in the passage; anchors resolve through their
  // backing card so a compound reading (银行 → 行) reflects that card's state too.
  const { dueDeckWords, pendingDeckWords } = useMemo(() => {
    const today = todayStr();
    const status = new Map<string, 'due' | 'pending'>();
    const mark = (key: string, w: DeckWord) => {
      if (isDueToday(w, today)) { status.set(key, 'due'); return; }
      const isNewCard = (w.reviews ?? 0) === 0 && w.stability === undefined;
      if (isNewCard && status.get(key) !== 'due') status.set(key, 'pending');
    };
    for (const w of deck) mark(w.h, w);
    passageAnchors.forEach((anchor, compound) => {
      const card = deck.find(d => d.id === anchor.id);
      if (card) mark(compound, card);
    });
    const due = new Set<string>(), pending = new Set<string>();
    status.forEach((s, k) => (s === 'due' ? due : pending).add(k));
    return { dueDeckWords: due, pendingDeckWords: pending };
  }, [deck, passageAnchors]);

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

  const contentKey = dailyContent
    ? `${dailyContent.date}|${dailyContent.hskLevel}|${dailyContent.deck ?? ''}`
    : '';
  useEffect(() => {
    setActiveSentence(0);
    // Restore the passage the user was last on for this content (survives tab switch /
    // reload); clamp in case the cached set is smaller than when it was saved.
    const saved = readSavedPassageIdx(contentKey);
    setPassageIdx(Math.min(saved, Math.max(0, numPassagesRef.current - 1)));
    setPeeked(new Set());
    setFrResponses({});
    setMcGrades({});
    setShowResults(false);
    setResultsBuilt(false);
    setVocabResults([]);
  }, [contentKey]);

  // Persist the current passage index so it can be restored above. Skip the render right
  // after contentKey changes (the restore effect owns the index then) to avoid writing the
  // previous content's index under the new key.
  const lastIdxKey = useRef('');
  useEffect(() => {
    if (!contentKey) return;
    if (lastIdxKey.current === contentKey) {
      try { sessionStorage.setItem(passageIdxKey(contentKey), String(passageIdx)); } catch { /* ignore */ }
    } else {
      lastIdxKey.current = contentKey;
    }
  }, [passageIdx, contentKey]);

  // Jump to a passage the user just generated with "+ new passage" — but NOT when content
  // first hydrates from cache (reload / tab switch back), so restoring honors the saved
  // passage instead of leaping to the last one.
  const prevNumPassages = useRef(0);
  const didHydrate = useRef(false);
  useEffect(() => {
    if (!didHydrate.current) {
      if (numPassages > 0) { didHydrate.current = true; prevNumPassages.current = numPassages; }
      return;
    }
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

  // One claim store shared by the title and the passage body, so adding (or queuing for
  // tomorrow) a word in either place is reflected in the other.
  const claimsStore = useClaims();
  // Words added while reading a passage are due TOMORROW — you just saw them in context,
  // so the first real review comes the next day (and they don't get re-pulled into more
  // passages you generate today).
  const titlePopup = useWordPopup((word, pinyin, meaning) => addWord({ h: word, p: pinyin, m: meaning, dueAt: dateInDays(1) }), deckWords, deckReadings, claimsStore);

  const handleAddVocabQuestion = useCallback((word: string, pinyin: string, meaning: string) => {
    addWord({ h: word, p: pinyin, m: meaning, dueAt: dateInDays(1) });
  }, [addWord]);

  const handlePeek = useCallback((word: string) => {
    setPeeked(prev => new Set([...prev, word]));
  }, []);

  const handleAddToDeck = useCallback((word: DeckWord) => {
    addWord({ ...word, dueAt: word.dueAt ?? dateInDays(1) });
  }, [addWord]);

  const toggleResults = useCallback(() => {
    if (!resultsBuilt) {
      setResultsBuilt(true);

      const frUsedWords = new Set<string>();
      Object.values(frResponses).forEach(r => {
        targetWords.forEach(w => { if (r.text.includes(w)) frUsedWords.add(w); });
      });

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

      const getWordGrade = (w: string): FsrsGrade => {
        if (peeked.has(w)) return 1;
        let best: FsrsGrade = 2;
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
        const inMc = mcWordGrades.has(w);
        const inFr = frUsedWords.has(w);
        if (inMc || inFr) {
          return { word: w, pinyin: deckWord?.p, status: 'stable' as const, msg: `Partially recalled — next in ${label}` };
        }
        return { word: w, pinyin: deckWord?.p, status: 'stable' as const, msg: `Not used — next in ${label}` };
      });

      const frTextAll = Object.values(frResponses).map(r => r.text).join(' ');
      const mcKeyRecalled = (word: string) =>
        Object.entries(mcGrades).some(([qi, g]) => g >= 2 && QUESTIONS[+qi]?.key.includes(word));
      const anchorGrade = (compound: string): FsrsGrade => {
        if (peeked.has(compound)) return 1;
        if (frTextAll.includes(compound) || mcKeyRecalled(compound)) return 3;
        return 2;
      };

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

      targetWords.forEach(w => updateWordReview(w, getWordGrade(w)));
      byCard.forEach(({ anchor, grade }) => gradeCard(anchor.id, grade));

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
      {showGuestLimit && (
        <div
          className="flex items-center justify-between gap-3 flex-wrap rounded-[11px] px-4 py-3 mb-5"
          style={{ background: 'var(--accent-soft, color-mix(in srgb, var(--accent) 10%, var(--card)))', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' }}
        >
          <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{GUEST_LIMIT_PROMPT}</span>
          <button
            onClick={() => onRequireSignIn?.(GUEST_LIMIT_PROMPT)}
            className="cursor-pointer transition-all duration-150 whitespace-nowrap"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', boxShadow: '0 2px 0 var(--accent-deep)' }}
          >
            Sign in
          </button>
        </div>
      )}

      <div className="flex justify-between items-end mb-2 flex-wrap gap-2.5">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {numPassages > 1
              ? `Today's ${numPassages} passages · ${totalReviewWordCount} review word${totalReviewWordCount === 1 ? '' : 's'} total`
              : totalReviewWordCount > 0
                ? `Today's passage · ${totalReviewWordCount} review word${totalReviewWordCount === 1 ? '' : 's'}`
                : "Today's passage · add words to your deck to track them here"
            }
            {dailyStatus === 'ready' && dailyContent?.sections?.passage && (
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
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, letterSpacing: '-.01em', marginTop: 4 }}>
            {hskLevel === 0 || dailyStatus === 'loading' ? (
              <div className="shimmer" style={{ height: 28, width: 140, borderRadius: 6, marginTop: 4 }} />
            ) : (
              <span style={{ fontFamily: 'var(--f-han)' }}>
                {TITLE_TOKENS.map((t, i) => {
                  // due → accent (review word); else pending → green '+'; else a tomorrow
                  // preview → gold '▸'. Same rules as the passage body.
                  const isReviewWord = dueDeckWords.has(t.text) && t.type === 'vocab';
                  const claimKind = isReviewWord ? null
                    : pendingDeckWords.has(t.text) ? 'vocab' as const
                    : claimsStore.claims.get(t.text) === 'tomorrow' ? 'tomorrow' as const
                    : null;
                  return <ClickableWord key={i} token={t} onOpen={titlePopup.openPopup} claimKind={claimKind} isReviewWord={isReviewWord} />;
                })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <DeckSelector deck={deck} customDecks={customDecks} selected={studyDecks} onChange={changeStudyDecks} />
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.05em' }}>
            level <span style={{ color: 'var(--jade)', fontWeight: 500 }}>HSK {hskLevel}</span> · ~{charCount} 字
          </div>
        </div>
      </div>

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

          <PassageText
            sentences={SENTENCES}
            activeSentenceIdx={activeSentence}
            audioOnly={audioOnly}
            peeked={peeked}
            onPeek={handlePeek}
            deckWords={passageDeckWords}
            dueDeckWords={dueDeckWords}
            pendingDeckWords={pendingDeckWords}
            deckReadings={deckReadings}
            onAddToDeck={handleAddToDeck}
            claims={claimsStore.claims}
            onClaimVocab={claimsStore.claimVocab}
            onClaimTomorrow={claimsStore.claimTomorrow}
          />

          <LookupSummary
            peekedCount={peeked.size}
            totalVocab={reviewWordCount}
            claimedCount={0}
          />
        </>
      )}

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

          <div className="flex justify-between items-center flex-wrap gap-2.5 mb-4">
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              Reading comprehension · {QUESTIONS.length} questions
            </span>
            <div className="flex gap-1.5">
              <button style={toggleStyle(responseMode === 'fr')} onClick={() => setResponseMode('fr')}>Free response</button>
              <button style={toggleStyle(responseMode === 'mc')} onClick={() => setResponseMode('mc')}>Multiple choice</button>
            </div>
          </div>

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

          {showResults && <VocabResults results={vocabResults} />}
        </>
      )}

      <WordPopup
        data={titlePopup.popup}
        onClose={titlePopup.closePopup}
        onAddVocab={titlePopup.handleAddVocab}
        onLearnTomorrow={titlePopup.handleLearnTomorrow}
      />
    </div>
  );
}
