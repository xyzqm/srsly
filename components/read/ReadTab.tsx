'use client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { ResponseMode, FRResponse, DeckWord, ContentSection, ClozeOccurrenceMap } from '@/lib/types';
import { getPassageDataForLanguage } from '@/lib/data/allPassages';
import { storage } from '@/lib/storage';
import { useLanguage } from '@/lib/LanguageContext';
import { levelFor } from '@/lib/languageConfig';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { fsrsNextInterval, fmtInterval, type FsrsGrade } from '@/lib/fsrs';
import { useWordPopup } from '@/hooks/useWordPopup';
import { useClaims } from '@/hooks/useClaims';
import { useDailyContent } from '@/hooks/useDailyContent';
import { groupReadings } from '@/lib/readings';
import { dateInDays, isDueToday, todayStr } from '@/lib/deck';
import { buildAnchorMap, type Anchor } from '@/lib/anchors';
import ClickableWord from '@/components/shared/ClickableWord';
import StudyScopeBanner from '@/components/shared/StudyScopeBanner';
import WordPopup from './WordPopup';
import PassagePlayer from './PassagePlayer';
import PassageText from './PassageText';
import PassageSkeleton from './PassageSkeleton';
import LookupSummary from './LookupSummary';
import Question from './Question';
import VocabResults from './VocabResults';
import MissedWordReview from './MissedWordReview';

interface Props {
  onScore: (score: number) => void;
  onRequireSignIn?: (reason?: string) => void;
  /** Ephemeral focused-study scope (from Vocab's "Study this deck"). null = global queue. */
  studyScope: string[] | null;
  onExitStudyScope: () => void;
}

const READ_WANT: ContentSection[] = ['passage'];

const GUEST_LIMIT_PROMPT = "You've used your free AI generations. Sign in for unlimited AI-generated passages and to sync your progress across devices.";

// Remembers which passage you were viewing, per day's content, so leaving and returning
// to the Read tab (or reloading) lands you back on the same passage. Keyed by content
// identity, so a new day / deck still starts fresh.
const passageIdxKey = (contentKey: string) => `srsly-read-pidx|${contentKey}`;
function readSavedPassageIdx(contentKey: string): number {
  if (!contentKey || typeof localStorage === 'undefined') return 0;
  const n = parseInt(localStorage.getItem(passageIdxKey(contentKey)) ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function ReadTab({ onScore, onRequireSignIn, studyScope, onExitStudyScope }: Props) {
  const { signedIn } = useAuth();
  const language = useLanguage();
  const { deck, addWord, updateWord, updateWordReview, gradeCard } = useVocabDeck(language);

  // Proficiency level in the active language (HSK 1–6 / JLPT 5–1). 0 = not loaded yet.
  const [hskLevel, setHskLevel] = useState(0);
  useEffect(() => { storage.getPrefs().then(p => setHskLevel(levelFor(language, p))); }, [language]);

  const passageData = useMemo(() => getPassageDataForLanguage(language, hskLevel), [language, hskLevel]);

  // Passages are generated from the GLOBAL due queue by default; a focused "Study this deck"
  // session (studyScope) temporarily narrows them to that deck. null = all.
  const { dailyContent, status: dailyStatus, loadMore, loadingMore, guestLimited, generateQuestionsForPassage, loadingQuestions } = useDailyContent(hskLevel, deck, studyScope, READ_WANT, language);

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
  // AI passages start with no questions; they're generated lazily on demand.
  // Static fallback passages always have questions pre-baked.
  const QUESTIONS = useMemo(
    () => currentPassage ? (currentPassage.questions ?? []) : passageData.questions,
    [currentPassage, passageData.questions],
  );
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
  const poolWords = useMemo(() => new Set(deck.filter(w => w.pool).map(w => w.h)), [deck]);
  const releaseWordFromPool = useCallback(async (h: string) => {
    const idx = deck.findIndex(d => d.h === h && d.pool);
    if (idx >= 0) updateWord(idx, { pool: undefined, dueAt: dateInDays(1) });
  }, [deck, updateWord]);
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
      if (w.pool) return; // pool words show no passage indicator
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

  // Count every blank occurrence in the passage (a word appearing N times = N blanks).
  const clozeWordCount = useMemo(() => {
    let count = 0;
    for (const s of SENTENCES) {
      for (const t of s.tokens) {
        if (t.type !== 'vocab') continue;
        const key = (t.baseForm && dueDeckWords.has(t.baseForm)) ? t.baseForm : t.text;
        if (dueDeckWords.has(key)) count++;
      }
    }
    return count;
  }, [SENTENCES, dueDeckWords]);

  const [activeSentence, setActiveSentence] = useState(0);
  const [audioOnly, setAudioOnly] = useState(false);
  const [responseMode, setResponseMode] = useState<ResponseMode>('fr');
  const [showClozeHints, setShowClozeHints] = useState(true);
  const [showWordBoundaries, setShowWordBoundaries] = useState(true);
  // Occurrence-based: keyed by "${sentenceIdx}-${tokenIdx}", value tracks word + grade.
  const [clozeGrades, setClozeGrades] = useState<Map<string, { word: string; grade: FsrsGrade }>>(new Map());
  const [frResponses, setFrResponses] = useState<Record<number, FRResponse>>({});
  const [mcGrades, setMcGrades] = useState<Record<number, FsrsGrade>>({});
  const [showResults, setShowResults] = useState(false);
  const [resultsBuilt, setResultsBuilt] = useState(false);
  const [vocabResults, setVocabResults] = useState<{ word: string; pinyin?: string; status: 'up' | 'down' | 'stable'; msg: string }[]>([]);
  const missedWords = useMemo(
    () => vocabResults
      .filter(r => r.status === 'down')
      .map(r => {
        const card = deck.find(d => d.h === r.word);
        return { h: r.word, p: r.pinyin ?? card?.p ?? '', m: card?.m ?? '' };
      }),
    [vocabResults, deck],
  );
  const [sessionAddedWords, setSessionAddedWords] = useState<{ h: string; p: string; m: string }[]>([]);
  const [showNoDueDialog, setShowNoDueDialog] = useState(false);
  const [alreadyFinished, setAlreadyFinished] = useState(false);

  // Per-word grade derived from occurrence map: worst grade across all occurrences of that word.
  const wordGrades = useMemo(() => {
    const map = new Map<string, FsrsGrade>();
    for (const { word, grade } of clozeGrades.values()) {
      const existing = map.get(word);
      map.set(word, existing !== undefined ? Math.min(existing, grade) as FsrsGrade : grade as FsrsGrade);
    }
    return map;
  }, [clozeGrades]);

  useEffect(() => {
    setActiveSentence(0);
    setPassageIdx(0);
    setClozeGrades(new Map());
    setFrResponses({});
    setMcGrades({});
    setShowResults(false);
    setResultsBuilt(false);
    setVocabResults([]);
    setSessionAddedWords([]);
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
    setClozeGrades(new Map());
    setFrResponses({});
    setMcGrades({});
    setShowResults(false);
    setResultsBuilt(false);
    setVocabResults([]);
    setSessionAddedWords([]);
  }, [contentKey]);

  // Persist the current passage index so it can be restored above. Skip the render right
  // after contentKey changes (the restore effect owns the index then) to avoid writing the
  // previous content's index under the new key.
  const lastIdxKey = useRef('');
  useEffect(() => {
    if (!contentKey) return;
    if (lastIdxKey.current === contentKey) {
      try { localStorage.setItem(passageIdxKey(contentKey), String(passageIdx)); } catch { /* ignore */ }
    } else {
      lastIdxKey.current = contentKey;
    }
  }, [passageIdx, contentKey]);

  // Persist / restore the "already finished" state per passage across tab switches and reloads.
  const passageFinishedKey = contentKey ? `srsly-done|${contentKey}|${passageIdx}` : '';
  useEffect(() => {
    if (!passageFinishedKey) return;
    try {
      const done = !!localStorage.getItem(passageFinishedKey);
      setAlreadyFinished(done);
      if (done) {
        setShowResults(true);
        const saved = localStorage.getItem(passageFinishedKey + '|results');
        if (saved) setVocabResults(JSON.parse(saved));
      }
    } catch { /* ignore */ }
  }, [passageFinishedKey]);

  // Restore cloze blank progress for the current passage (survives reloads and new-device sign-in).
  useEffect(() => {
    if (!contentKey) return;
    storage.getPassageState(contentKey, passageIdx).then(state => {
      if (!state || Object.keys(state).length === 0) return;
      setClozeGrades(new Map(
        Object.entries(state).map(([k, v]) => [k, { word: v.word, grade: v.grade as FsrsGrade }])
      ));
    });
  }, [contentKey, passageIdx]);

  // Save cloze blank progress whenever a blank is answered.
  useEffect(() => {
    if (!contentKey || clozeGrades.size === 0) return;
    const state: ClozeOccurrenceMap = {};
    clozeGrades.forEach((entry, oid) => { state[oid] = entry; });
    storage.savePassageState(contentKey, passageIdx, state);
  }, [clozeGrades, contentKey, passageIdx]);

  // Restore words added during this session so they survive reloads.
  useEffect(() => {
    if (!contentKey) return;
    try {
      const raw = localStorage.getItem(`srsly-added-words|${contentKey}|${passageIdx}`);
      setSessionAddedWords(raw ? JSON.parse(raw) : []);
    } catch { /* ignore */ }
  }, [contentKey, passageIdx]);

  // Persist session-added words whenever the list changes.
  useEffect(() => {
    if (!contentKey) return;
    try {
      if (sessionAddedWords.length === 0) return;
      localStorage.setItem(`srsly-added-words|${contentKey}|${passageIdx}`, JSON.stringify(sessionAddedWords));
    } catch { /* ignore */ }
  }, [sessionAddedWords, contentKey, passageIdx]);

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
      setClozeGrades(new Map());
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
    setClozeGrades(new Map());
    setFrResponses({});
    setMcGrades({});
    setShowResults(false);
    setResultsBuilt(false);
    setVocabResults([]);
  }, [numPassages]);

  // One claim store shared by the title and the passage body, so adding a word in either
  // place is reflected in the other.
  const claimsStore = useClaims();
  // Words added while reading a passage are due TOMORROW — you just saw them in context,
  // so the first real review comes the next day (and they don't get re-pulled into more
  // passages you generate today).
  const trackAdded = useCallback((h: string, p: string, m: string) => {
    setSessionAddedWords(prev => prev.some(w => w.h === h) ? prev : [...prev, { h, p, m }]);
  }, []);

  const titlePopup = useWordPopup((word, pinyin, meaning) => {
    addWord({ h: word, p: pinyin, m: meaning, dueAt: dateInDays(1) });
    trackAdded(word, pinyin, meaning);
  }, deckWords, deckReadings, claimsStore, poolWords, releaseWordFromPool);

  const handleAddVocabQuestion = useCallback((word: string, pinyin: string, meaning: string) => {
    addWord({ h: word, p: pinyin, m: meaning, dueAt: dateInDays(1) });
    trackAdded(word, pinyin, meaning);
  }, [addWord, trackAdded]);

  const handleClozeAnswer = useCallback((occurrenceId: string, word: string, correct: boolean) => {
    setClozeGrades(prev => {
      if (prev.has(occurrenceId)) return prev; // already graded (ClozeBlank prevents re-grade, but be safe)
      const next = new Map(prev);
      next.set(occurrenceId, { word, grade: correct ? 3 : 1 });
      return next;
    });
  }, []);

  const handleAddToDeck = useCallback((word: DeckWord) => {
    addWord({ ...word, dueAt: word.dueAt ?? dateInDays(1) });
    trackAdded(word.h, word.p ?? '', word.m ?? '');
  }, [addWord, trackAdded]);

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
        if (wordGrades.has(w)) return wordGrades.get(w)!;
        let best: FsrsGrade = 2;
        if (frUsedWords.has(w)) best = 3;
        const mcG = mcWordGrades.get(w);
        if (mcG !== undefined && mcG > best) best = mcG;
        return best;
      };

      // Include cloze-graded deck words even when static passages have vocabWords: []
      const anchorCompoundSet = new Set(passageAnchors.keys());
      const deckWordSet = new Set(deck.map(d => d.h));
      const clozeOnlyWords = [...wordGrades.keys()].filter(
        w => deckWordSet.has(w) && !targetWords.includes(w) && !anchorCompoundSet.has(w)
      );
      const allResultWords = [...targetWords, ...clozeOnlyWords];

      const rows = allResultWords.map(w => {
        const deckWord = deck.find(d => d.h === w);
        const grade = getWordGrade(w);
        const days = deckWord ? Math.max(1, fsrsNextInterval(deckWord, grade)) : 1;
        const label = fmtInterval(days);
        if (wordGrades.has(w)) {
          return grade === 3
            ? { word: w, pinyin: deckWord?.p, status: 'up' as const, msg: `Typed correctly — next in ${label}` }
            : { word: w, pinyin: deckWord?.p, status: 'down' as const, msg: `Typed incorrectly — review in ${label}` };
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
        if (wordGrades.has(compound)) return wordGrades.get(compound)!;
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
        const days = card ? Math.max(1, fsrsNextInterval(card, grade)) : 1;
        const label = fmtInterval(days);
        const tag = `${anchor.hanzi} ${anchor.pinyin}`;
        const shown = compounds.join('、');
        const isClozeGraded = compounds.some(c => wordGrades.has(c));
        if (isClozeGraded) {
          return grade === 3
            ? { word: shown, pinyin: anchor.pinyin, status: 'up' as const, msg: `Typed correctly (${tag}) — next in ${label}` }
            : { word: shown, pinyin: anchor.pinyin, status: 'down' as const, msg: `Typed incorrectly (${tag}) — review in ${label}` };
        }
        if (grade === 3) return { word: shown, pinyin: anchor.pinyin, status: 'up' as const, msg: `Recalled (${tag}) — next in ${label}` };
        return { word: shown, pinyin: anchor.pinyin, status: 'stable' as const, msg: `${tag} — next in ${label}` };
      });

      setVocabResults([...rows, ...anchorRows]);

      allResultWords.forEach(w => updateWordReview(w, getWordGrade(w), { minDaysOut: 1 }));
      byCard.forEach(({ anchor, grade }) => gradeCard(anchor.id, grade, { minDaysOut: 1 }));

      if (QUESTIONS.length > 0) {
        const okCount =
          Object.values(frResponses).filter(r => r.verdict === 'ok').length +
          Object.values(mcGrades).filter(g => g >= 2).length;
        onScore(Math.round((okCount / QUESTIONS.length) * 100));
      }

      if (passageFinishedKey) {
        try {
          localStorage.setItem(passageFinishedKey, '1');
          localStorage.setItem(passageFinishedKey + '|results', JSON.stringify([...rows, ...anchorRows]));
        } catch { /* ignore */ }
      }
      setAlreadyFinished(true);
    }
    if (!alreadyFinished) setShowResults(v => !v);
  }, [resultsBuilt, alreadyFinished, passageFinishedKey, frResponses, mcGrades, wordGrades, onScore, targetWords, deck, QUESTIONS, updateWordReview, passageAnchors, gradeCard]);

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
      {studyScope && <StudyScopeBanner decks={studyScope} onExit={onExitStudyScope} />}
      {showNoDueDialog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(20,18,16,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            onClick={e => e.stopPropagation()}
            className="animate-rise"
            style={{ width: 380, maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '26px 24px', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}
          >
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-.01em' }}>
              All caught up
            </div>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, lineHeight: 1.6, margin: '8px 0 22px' }}>
              You have no words due for review today. New passages won&apos;t have any focus vocabulary.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => { setShowNoDueDialog(false); loadMore(); }}
                style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 16px', cursor: 'pointer', boxShadow: '0 2px 0 var(--accent-deep)' }}
              >
                Generate anyway
              </button>
              <button
                onClick={() => setShowNoDueDialog(false)}
                style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 16px', color: 'var(--ink-soft)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
                  // due → accent (review word); else pending (added, not yet due) → green '+'.
                  // Same rules as the passage body.
                  const isReviewWord = dueDeckWords.has(t.text) && t.type === 'vocab';
                  const claimKind = isReviewWord ? null
                    : pendingDeckWords.has(t.text) ? 'vocab' as const
                    : null;
                  return <ClickableWord key={i} token={t} onOpen={titlePopup.openPopup} claimKind={claimKind} isReviewWord={isReviewWord} />;
                })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.05em' }}>
            level <span style={{ color: 'var(--jade)', fontWeight: 500 }}>{language === 'ja' ? `JLPT N${hskLevel}` : `HSK ${hskLevel}`}</span> · ~{charCount} 字
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
              <button style={toggleStyle(showClozeHints)} onClick={() => setShowClozeHints(v => !v)}>
                Hints
              </button>
              <button style={toggleStyle(showWordBoundaries)} onClick={() => setShowWordBoundaries(v => !v)}>
                Boundaries
              </button>
              <button style={toggleStyle(audioOnly)} onClick={() => setAudioOnly(v => !v)}>
                🎧 Audio only
              </button>
            </div>
          </div>

          <PassageText
            sentences={SENTENCES}
            activeSentenceIdx={activeSentence}
            audioOnly={audioOnly}
            deckWords={passageDeckWords}
            dueDeckWords={dueDeckWords}
            pendingDeckWords={pendingDeckWords}
            deckReadings={deckReadings}
            onAddToDeck={handleAddToDeck}
            onClaimVocab={claimsStore.claimVocab}
            poolWords={poolWords}
            onReleaseFromPool={releaseWordFromPool}
            showClozeHints={showClozeHints}
            onClozeAnswer={handleClozeAnswer}
            restoredClozeGrades={clozeGrades}
            showWordBoundaries={showWordBoundaries}
          />

          <LookupSummary
            totalVocab={clozeWordCount}
            clozeAnswered={clozeGrades.size}
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

          {QUESTIONS.length === 0 && currentPassage ? (
            <div className="flex justify-center py-2 mb-4">
              {loadingQuestions ? (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-faint)', letterSpacing: '.06em' }}>
                  Generating questions…
                </div>
              ) : (
                <button
                  onClick={() => generateQuestionsForPassage(passageIdx)}
                  className="cursor-pointer transition-all duration-150"
                  style={{
                    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
                    background: 'none', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--line)',
                    borderRadius: 8, padding: '10px 18px', color: 'var(--ink-soft)', cursor: 'pointer',
                  }}
                >
                  + Generate reading comprehension questions
                </button>
              )}
            </div>
          ) : QUESTIONS.length > 0 ? (
            <>
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
            </>
          ) : null}

          <div className="flex gap-2.5 justify-center flex-wrap mt-8 pt-6" style={{ borderTop: '1px solid var(--line-soft)' }}>
            {(() => {
              const clozeIncomplete = clozeWordCount > 0 && clozeGrades.size < clozeWordCount;
              const isDisabled = alreadyFinished || clozeIncomplete;
              const label = alreadyFinished
                ? 'Already finished!'
                : clozeIncomplete
                  ? `${clozeGrades.size}/${clozeWordCount} blanks filled in`
                  : 'Finish & see vocabulary results';
              // A new passage can only be generated once every blank in the current one is filled in.
              const newPassageDisabled = clozeIncomplete || loadingMore;
              return (
                <>
                  <button
                    onClick={toggleResults}
                    disabled={isDisabled}
                    className="flex items-center gap-2 transition-all duration-150"
                    style={{
                      fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                      background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                      padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isDisabled ? 0.45 : 1,
                    }}
                  >
                    {label}
                  </button>
                  <button
                    onClick={() => {
                      if (dueDeckWords.size === 0) { setShowNoDueDialog(true); return; }
                      loadMore();
                    }}
                    disabled={newPassageDisabled}
                    title={clozeIncomplete ? 'Fill in every blank to unlock a new passage' : undefined}
                    className="flex items-center gap-2 transition-all duration-150"
                    style={{
                      fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                      background: 'none', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8,
                      padding: '12px 20px',
                      cursor: newPassageDisabled ? 'not-allowed' : 'pointer',
                      opacity: newPassageDisabled ? 0.45 : 1,
                    }}
                  >
                    {loadingMore ? `Generating… ${genEstShort}` : '+ New passage'}
                  </button>
                </>
              );
            })()}
          </div>

          {showResults && <VocabResults results={vocabResults} />}
          {showResults && (() => {
            const missedSet = new Set(missedWords.map(w => w.h));
            const reviewWords = [...missedWords, ...sessionAddedWords.filter(w => !missedSet.has(w.h))];
            const cacheKey = contentKey ? `srsly-missed-sentences|${contentKey}|${passageIdx}` : undefined;
            return <MissedWordReview words={reviewWords} missedCount={missedWords.length} cacheKey={cacheKey} language={language} level={hskLevel} />;
          })()}
        </>
      )}

      <WordPopup
        data={titlePopup.popup}
        onClose={titlePopup.closePopup}
        onAddVocab={titlePopup.handleAddVocab}
        onReleaseFromPool={titlePopup.onReleaseFromPool}
      />
    </div>
  );
}
