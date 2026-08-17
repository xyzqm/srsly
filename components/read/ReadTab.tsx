'use client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Fragment, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { ResponseMode, FRResponse, DeckWord, ContentSection, ClozeOccurrenceMap } from '@/lib/types';
import { storage } from '@/lib/storage';
import { useLanguage } from '@/lib/LanguageContext';
import { levelFor, levelLabel, getLanguageConfig, RECOMMENDED_BLANK_DENSITY } from '@/lib/languageConfig';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { fsrsNextInterval, fmtInterval, type FsrsGrade } from '@/lib/fsrs';
import { useWordPopup } from '@/hooks/useWordPopup';
import { useClaims } from '@/hooks/useClaims';
import { useDailyContent } from '@/hooks/useDailyContent';
import { groupReadings } from '@/lib/readings';
import { dateInDays, isReadyNow, todayStr } from '@/lib/deck';
import { buildAnchorMap, type Anchor } from '@/lib/anchors';
import { bumpCount, getTodayCounts } from '@/lib/reviewCounts';
import { getSrsSettings } from '@/lib/fsrs';
import { needsSpaceBefore } from '@/lib/tokenText';
import ClickableWord from '@/components/shared/ClickableWord';
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
  /**
   * Mark today as studied. Fired when a passage is FINISHED, separately from onScore —
   * onScore only fires when the passage had comprehension questions, so reading was not
   * keeping the streak alive on its own. Reading is studying; it counts.
   */
  onActivity: () => void;
  /** One passage-cloze answer, logged per blank so a half-finished passage still counts. */
  onAnswer: (correct: boolean) => void;
  onRequireSignIn?: (reason?: string) => void;
  onNavigateVocab?: () => void;
}

const READ_WANT: ContentSection[] = ['passage'];

/**
 * The recovery path blanks at the learner's chosen density (Settings → Blank density),
 * the same number the generator is sized from — so the two agree instead of one being a
 * preference and the other a constant.
 */
/** Short passages still get a usable number of blanks. */
const MIN_BLANKS = 3;


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

export default function ReadTab({ onScore, onActivity, onAnswer, onRequireSignIn, onNavigateVocab }: Props) {
  const { signedIn } = useAuth();
  const language = useLanguage();
  const langConfig = getLanguageConfig(language);
  const { deck, addWord, updateWord, updateWordReview, gradeCard } = useVocabDeck(language);
  // Latest deck, readable from a callback without making it depend on every deck change.
  const deckRef = useRef(deck);
  deckRef.current = deck;
  /** Brand-new words already charged to today's budget, so a word blanked twice costs one. */
  const spentNewRef = useRef<Set<string>>(new Set());

  // Proficiency level in the active language (HSK 1–6 / JLPT 5–1). 0 = not loaded yet.
  const [hskLevel, setHskLevel] = useState(0);
  const [blankDensity, setBlankDensity] = useState<number | undefined>(undefined);
  useEffect(() => {
    storage.getPrefs().then(p => {
      setHskLevel(levelFor(language, p));
      setBlankDensity(p.blankDensity);
    });
  }, [language]);

  // One deck per language, so passages always draw on the whole due queue.
  const { dailyContent, status: dailyStatus, loadMore, loadingMore, guestLimited, generateQuestionsForPassage, loadingQuestions } = useDailyContent(hskLevel, deck, READ_WANT, language, blankDensity);

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

  const SENTENCES    = useMemo(() => currentPassage?.sentences ?? [], [currentPassage]);
  const TITLE_TOKENS = useMemo(() => currentPassage?.titleTokens ?? [], [currentPassage]);
  // AI passages start with no questions; they're generated lazily on demand.
  const QUESTIONS = useMemo(() => currentPassage?.questions ?? [], [currentPassage]);
  // Passage length: characters for unspaced scripts, words for spaced ones — a Han-character
  // count is the natural measure for zh/ja and always zero for Spanish.
  const charCount = currentPassage
    ? currentPassage.sentences.flatMap(s => s.tokens).filter(t =>
        langConfig.scriptIsUnspaced ? /[一-鿿]/.test(t.text) : t.type !== 'punct'
      ).length
    : 0;

  const genEstShort = hskLevel <= 3 ? '~15–25s' : '~20–35s';
  const genEstLong  = hskLevel <= 3 ? 'about 15–25 seconds' : 'about 20–35 seconds';

  /** What the generator was asked to build this passage around, as recorded at the time. */
  const storedVocabWords = useMemo(
    () => new Set(currentPassage?.vocabWords ?? []),
    [currentPassage]
  );

  const deckWords = useMemo(() => new Set(deck.map(d => d.h)), [deck]);
  const deckReadings = useMemo(() => groupReadings(deck), [deck]);
  const poolWords = useMemo(() => new Set(deck.filter(w => w.pool).map(w => w.h)), [deck]);
  const releaseWordFromPool = useCallback(async (h: string) => {
    const idx = deck.findIndex(d => d.h === h && d.pool);
    if (idx >= 0) updateWord(idx, { pool: undefined, dueAt: dateInDays(1) });
  }, [deck, updateWord]);

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
      // isReadyNow, not isDueToday: a card part-way through a learning step is due TODAY but
      // not due YET. Blanking it again ten seconds after it was answered is the thing the
      // step exists to prevent. Practice keeps it, shows a countdown, and finishes the step.
      if (isReadyNow(w, today)) { status.set(key, 'due'); return; }
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

  /**
   * This passage's target words — normally the list recorded at generation time, but
   * REBUILT FROM THE PASSAGE ITSELF when that list is empty.
   *
   * `vocabWords` is written once, when the passage is generated, and everything downstream
   * hangs off it: the cloze blanks, the review-word count in the header, the words the
   * finish handler schedules. When it comes back empty the passage silently degrades to
   * plain text with no blanks and a header reading "add words to your deck" — which is
   * indistinguishable from having an empty deck, and there is no way to recover it, because
   * nothing recomputes the list once it is stored.
   *
   * WHICH DUE WORDS, AND WHY NOT ALL OF THEM
   * Every due word in the text is a candidate, and they are taken MOST OVERDUE FIRST. That
   * ordering is the whole design: no word is passed over for being short, common, or hard
   * to guess from context — recall difficulty is FSRS's business, and a missed blank is
   * information the scheduler wants. A word is only left out because the passage ran out of
   * room, and being left out costs it nothing: it stays due, it is still in flashcards, and
   * its debt has only grown by the time the next passage is built, so it sorts higher then.
   *
   * The cap exists because the alternative is not a harder exercise, it is an unreadable
   * one — 75 blanks in 96 words, with no prose left to recover any of them from.
   */
  const PASSAGE_VOCAB_SET = useMemo(() => {
    if (storedVocabWords.size > 0 || !currentPassage) return storedVocabWords;

    // Occurrences per candidate, in reading order.
    const cost = new Map<string, number>();
    let tokens = 0;
    for (const sent of currentPassage.sentences) {
      for (const t of sent.tokens) {
        if (t.type === 'punct') continue;
        tokens++;
        const key = t.baseForm && dueDeckWords.has(t.baseForm) ? t.baseForm : t.text;
        if (dueDeckWords.has(key)) cost.set(key, (cost.get(key) ?? 0) + 1);
      }
    }
    if (cost.size === 0) return storedVocabWords;

    // How long each has been owed. A card with no `dueAt` is new rather than overdue, so it
    // sorts as due today — behind anything genuinely late, ahead of anything scheduled on.
    const today = todayStr();
    const owedSince = new Map<string, string>();
    for (const w of deck) {
      if (!cost.has(w.h)) continue;
      const due = w.dueAt ?? today;
      const seen = owedSince.get(w.h);
      if (!seen || due < seen) owedSince.set(w.h, due);
    }

    // The learner's own density, so the recovery path and the generator obey one setting.
    const share = (blankDensity ?? RECOMMENDED_BLANK_DENSITY) / 100;
    const budget = Math.max(MIN_BLANKS, Math.round(tokens * share));
    // Map iteration is reading order, so words owed since the same day break ties stably.
    const ranked = [...cost.keys()].sort((a, b) =>
      (owedSince.get(a) ?? today).localeCompare(owedSince.get(b) ?? today));

    const found = new Set<string>();
    let blanks = 0;
    for (const word of ranked) {
      const n = cost.get(word)!;
      if (blanks + n > budget) continue;
      found.add(word);
      blanks += n;
    }
    if (found.size > 0) {
      console.info(`[read] passage stored no target words; recovered ${found.size} of ${cost.size} due (${blanks} of ${tokens} words blanked)`);
    }
    return found;
  }, [storedVocabWords, currentPassage, dueDeckWords, deck, blankDensity]);

  const targetWords = useMemo(
    () => deck.map(d => d.h).filter(h => PASSAGE_VOCAB_SET.has(h)),
    [deck, PASSAGE_VOCAB_SET]
  );

  const totalReviewWordCount = useMemo(() => {
    const all = new Set(dailyContent?.passages.flatMap(p => p.vocabWords) ?? []);
    // Every passage stored an empty list — report what the current one recovered rather
    // than claiming the deck is empty.
    return all.size > 0 ? all.size : PASSAGE_VOCAB_SET.size;
  }, [dailyContent, PASSAGE_VOCAB_SET]);

  // The words this passage actually blanks out: its target words, narrowed to those still
  // due. Blanking every due deck word that merely happens to appear would bury the passage
  // — once the due queue is large, an HSK 3 text is almost entirely deck vocabulary, and the
  // reader gets a wall of gaps instead of prose. The set is already keyed the way tokens
  // resolve here (surface form, Japanese base form, or anchor compound), so no extra
  // normalisation is needed.
  const clozeWords = useMemo(
    () => new Set([...PASSAGE_VOCAB_SET].filter(w => dueDeckWords.has(w))),
    [PASSAGE_VOCAB_SET, dueDeckWords]
  );

  /**
   * Brand-new target words in this passage, with their meanings — the pre-reading primer.
   *
   * You cannot test what you have not taught. A cloze blank measures recall, and asking
   * someone to recall a word they have never met measures nothing; it just produces a wrong
   * answer, an Again grade, and a card that starts its life in relearning for no reason.
   * Naming them before the passage is what makes the blank a test rather than a guess.
   *
   * Only genuinely new cards appear here. A word you have reviewed before is not news, and
   * listing it would give away a blank you could have recalled.
   */
  const primerWords = useMemo(() => {
    const seen = new Set<string>();
    const out: DeckWord[] = [];
    for (const w of deck) {
      if (!clozeWords.has(w.h) || seen.has(w.h)) continue;
      if ((w.reviews ?? 0) === 0 && w.stability === undefined && w.phase !== 'learning') {
        seen.add(w.h);
        out.push(w);
      }
    }
    return out;
  }, [deck, clozeWords]);

  /** Due new words this passage could not take because the daily budget ran out. */
  const heldBackNew = useMemo(() => {
    if (!currentPassage) return 0;
    const left = getSrsSettings().newPerDay - getTodayCounts().newCount;
    if (left > 0) return 0;
    return deck.filter(w =>
      dueDeckWords.has(w.h) && !clozeWords.has(w.h)
      && (w.reviews ?? 0) === 0 && w.stability === undefined && w.phase !== 'learning',
    ).length;
  }, [deck, dueDeckWords, clozeWords, currentPassage]);

  const reviewWordCount = clozeWords.size;

  // Count every blank occurrence in the passage (a word appearing N times = N blanks), and
  // separately how many distinct words those blanks cover — the summary reports both, since
  // "9 blanks" and "5 review words" are different facts and conflating them is what made the
  // old copy read as if the deck had exploded.
  // Declared before the counters below, which read it: an occurrence with a recorded answer
  // is still a blank even once its card is no longer due.
  const [clozeGrades, setClozeGrades] = useState<Map<string, { word: string; grade: FsrsGrade }>>(new Map());

  const { clozeWordCount, clozeDistinctCount, blankIds } = useMemo(() => {
    let count = 0;
    const distinct = new Set<string>();
    const ids = new Set<string>();
    SENTENCES.forEach((s, si) => {
      s.tokens.forEach((t, ti) => {
        if (t.type !== 'vocab') return;
        const id = `${si}-${ti}`;
        const key = (t.baseForm && clozeWords.has(t.baseForm)) ? t.baseForm : t.text;
        // Same rule PassageText renders by, or the count and the page disagree.
        if (clozeWords.has(key) || clozeGrades.has(id)) { count++; distinct.add(key); ids.add(id); }
      });
    });
    return { clozeWordCount: count, clozeDistinctCount: distinct.size, blankIds: ids };
  }, [SENTENCES, clozeWords, clozeGrades]);

  const [activeSentence, setActiveSentence] = useState(0);
  const [audioOnly, setAudioOnly] = useState(false);
  const [responseMode, setResponseMode] = useState<ResponseMode>('fr');
  const [showClozeHints, setShowClozeHints] = useState(true);
  // Word-boundary marks exist because CJK has no spaces. Spanish already delimits its
  // words, so they default off there (the BOUNDARIES toggle still works either way).
  // Set in an effect, not as the useState initial value: `language` starts at the context
  // default ('zh') and only becomes the user's real language once prefs load, so an
  // initial-value default would stick on the wrong setting.
  const [showWordBoundaries, setShowWordBoundaries] = useState(true);
  useEffect(() => {
    setShowWordBoundaries(getLanguageConfig(language).scriptIsUnspaced);
  }, [language]);
  // Occurrence-based: keyed by "${sentenceIdx}-${tokenIdx}", value tracks word + grade.

  /**
   * Answered blanks that are STILL blanks.
   *
   * `clozeGrades` is keyed by occurrence and persisted per passage, but which occurrences
   * are blanks is derived live from the deck — so the two drift apart the moment the deck
   * changes under a passage you already worked on. Clearing the deck mid-passage left eight
   * recorded answers against one remaining blank and the counter read "8/1 blanks filled".
   * Grades for occurrences that are no longer blanks are kept (the deck may come back) but
   * not counted.
   */
  const clozeAnswered = useMemo(
    () => [...clozeGrades.keys()].filter(id => blankIds.has(id)).length,
    [clozeGrades, blankIds],
  );
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
    ? `${dailyContent.date}|${dailyContent.language ?? 'zh'}|${dailyContent.hskLevel}`
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

  // "+ New passage" must stay disabled until EVERY generated passage today is fully filled
  // in, not just the one currently being viewed — otherwise navigating back to an already-
  // finished earlier passage re-enables the button while a later, unfinished one is left
  // behind, and its due words get wrongly treated as reviewed.
  const [allPassagesComplete, setAllPassagesComplete] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!dailyContent || !contentKey) { if (!cancelled) setAllPassagesComplete(true); return; }
      const results = await Promise.all(dailyContent.passages.map(async (passage, idx) => {
        // Same rule as `clozeWords`, but scoped to each passage's own target words.
        const blankable = new Set(passage.vocabWords.filter(w => dueDeckWords.has(w)));
        let needed = 0;
        for (const s of passage.sentences) {
          for (const t of s.tokens) {
            if (t.type !== 'vocab') continue;
            const key = (t.baseForm && blankable.has(t.baseForm)) ? t.baseForm : t.text;
            if (blankable.has(key)) needed++;
          }
        }
        if (needed === 0) return true;
        const graded = idx === passageIdx
          ? clozeGrades.size
          : Object.keys((await storage.getPassageState(contentKey, idx)) ?? {}).length;
        return graded >= needed;
      }));
      if (!cancelled) setAllPassagesComplete(results.every(Boolean));
    }
    check();
    return () => { cancelled = true; };
  }, [dailyContent, contentKey, passageIdx, clozeGrades, dueDeckWords]);

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
    let firstTime = false;
    setClozeGrades(prev => {
      if (prev.has(occurrenceId)) return prev; // already graded (ClozeBlank prevents re-grade, but be safe)
      firstTime = true;
      const next = new Map(prev);
      next.set(occurrenceId, { word, grade: correct ? 3 : 1 });
      return next;
    });
    // Only the first grading of a blank counts, so restoring a passage you already answered
    // cannot inflate the figure.
    if (!firstTime) return;
    onAnswer(correct);
    /**
     * Spend from the shared daily new-card budget — the other half of "one budget, two
     * doors" (see selectTargets in useDailyContent).
     *
     * On ANSWERING, not on generating. A word introduced is a word you were actually shown
     * and asked to recall; charging the budget at generation time would mean flicking
     * through three passages without answering anything burnt the whole day.
     *
     * `spentNewRef` guards the case where the same brand-new word is blanked twice in one
     * passage: that is one card entering circulation, not two.
     */
    const card = deckRef.current.find(d => d.h === word);
    if (card && (card.reviews ?? 0) === 0 && card.stability === undefined && card.phase !== 'learning'
        && !spentNewRef.current.has(word)) {
      spentNewRef.current.add(word);
      bumpCount('new');
    }
  }, [onAnswer]);

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
      // Finishing the passage is the activity, whether or not it carried questions. Sits
      // beside the `srsly-done` write so the two can never disagree about what "finished"
      // means; recordActivity is idempotent for the day.
      onActivity();
      setAlreadyFinished(true);
    }
    if (!alreadyFinished) setShowResults(v => !v);
  }, [resultsBuilt, alreadyFinished, passageFinishedKey, frResponses, mcGrades, wordGrades, onScore, onActivity, targetWords, deck, QUESTIONS, updateWordReview, passageAnchors, gradeCard]);

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
                  // One of this passage's due target words → accent underline. Same rule as
                  // the passage body.
                  const isReviewWord = clozeWords.has(t.text) && t.type === 'vocab';
                  // The title goes through needsSpaceBefore like every other renderer. It
                  // used to lean on the '+' badge span after each word as an accidental
                  // spacer, which is why "La salud y el ejercicio" held together at all in
                  // Spanish — a superscript's width standing in for a space.
                  return (
                    <Fragment key={i}>
                      {needsSpaceBefore(TITLE_TOKENS, i, langConfig.scriptIsUnspaced)}
                      <ClickableWord token={t} onOpen={titlePopup.openPopup} isReviewWord={isReviewWord} />
                    </Fragment>
                  );
                })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.05em' }}>
            level <span style={{ color: 'var(--jade)', fontWeight: 500 }}>{levelLabel(language, hskLevel)}</span> · ~{charCount} {langConfig.countUnit}
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
      ) : !currentPassage ? (
        <div className="flex flex-col items-center text-center py-16 px-6">
          {dueDeckWords.size === 0 ? (
            <>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-.01em' }}>
                All caught up
              </div>
              <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, lineHeight: 1.6, margin: '10px 0 24px', maxWidth: 380 }}>
                You have no words due for review today. Add new words to your deck to get a fresh passage built around them.
              </p>
              <button
                onClick={onNavigateVocab}
                className="cursor-pointer transition-all duration-150"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)' }}
              >
                Add words in Vocab
              </button>
            </>
          ) : (
            <>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-.01em' }}>
                {dailyStatus === 'error' ? "Couldn't generate a passage" : 'No passage yet'}
              </div>
              <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, lineHeight: 1.6, margin: '10px 0 24px', maxWidth: 380 }}>
                {dailyStatus === 'error'
                  ? 'Something went wrong generating today’s passage. Try again.'
                  : 'Generate a passage built around your due words.'}
              </p>
              <button
                onClick={() => loadMore()}
                disabled={loadingMore}
                className="cursor-pointer transition-all duration-150 disabled:opacity-45 disabled:cursor-not-allowed"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)' }}
              >
                {loadingMore ? `Generating… ${genEstShort}` : 'Generate passage'}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-2 items-center mb-4 flex-wrap">
            <PassagePlayer sentences={SENTENCES} onSentenceChange={setActiveSentence} />
            <div className="ml-auto flex gap-2 items-center flex-wrap">
              {/* Named for what it does rather than what it is. It controls two things —
                  the English gloss on hover AND the letter-by-letter colouring as you type
                  — and "Hints" gave no reason to expect the second, so turning it off to
                  drop the tooltip silently made the typing harder as well. */}
              <button
                style={toggleStyle(showClozeHints)}
                onClick={() => setShowClozeHints(v => !v)}
                title={showClozeHints
                  ? 'Showing the English on hover, and colouring your typing as you go'
                  : 'No help: type your answer and find out when you commit it'}
              >
                Help me
              </button>
              {/* Only for scripts that don't delimit their own words. In Spanish and French
                  every space is already a boundary, so the toggle offered a choice between
                  "correct" and "correct with underlines" — a decoration masquerading as a
                  practice mode. */}
              {langConfig.scriptIsUnspaced && (
                <button style={toggleStyle(showWordBoundaries)} onClick={() => setShowWordBoundaries(v => !v)}>
                  Boundaries
                </button>
              )}
              <button style={toggleStyle(audioOnly)} onClick={() => setAudioOnly(v => !v)}>
                🎧 Audio only
              </button>
            </div>
          </div>

          {/* Teach, then test. These are the passage's brand-new words, named before you
              read rather than sprung on you as a blank you have no way to fill. */}
          {primerWords.length > 0 && (
            <div
              className="rounded-[11px] px-5 py-4 mb-4"
              style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
            >
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                New words to know · {primerWords.length}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '5px 0 10px', maxWidth: '52ch' }}>
                You haven&apos;t seen {primerWords.length === 1 ? 'this one' : 'these'} before. Read {primerWords.length === 1 ? 'it' : 'them'} now — the passage will ask you to fill {primerWords.length === 1 ? 'it' : 'them'} in.
              </p>
              <div className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                {primerWords.map(w => (
                  <div key={w.id ?? w.h} className="flex items-baseline gap-2.5">
                    <span style={{
                      fontFamily: langConfig.scriptIsUnspaced ? 'var(--f-han)' : 'var(--f-display)',
                      fontSize: 16, color: 'var(--ink)', whiteSpace: 'nowrap',
                    }}>
                      {w.h}
                    </span>
                    {w.p && (
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{w.p}</span>
                    )}
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                      {(w.m ?? '').split(';')[0].trim()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Not "there were no more words" — there were, and the daily limit is holding
              them for tomorrow. Without saying so it reads as the deck being exhausted. */}
          {heldBackNew > 0 && (
            <p style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.5, marginBottom: 12 }}>
              {heldBackNew} more new word{heldBackNew === 1 ? '' : 's'} held back by your {getSrsSettings().newPerDay}/day limit — {heldBackNew === 1 ? 'it returns' : 'they return'} tomorrow.
            </p>
          )}

          <PassageText
            sentences={SENTENCES}
            activeSentenceIdx={activeSentence}
            audioOnly={audioOnly}
            deckWords={passageDeckWords}
            clozeWords={clozeWords}
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
            contextualMeanings={currentPassage?.contextualMeanings}
          />

          <LookupSummary
            totalVocab={clozeWordCount}
            distinctWords={clozeDistinctCount}
            clozeAnswered={clozeAnswered}
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

      {dailyStatus !== 'loading' && currentPassage && (
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
                    claimsStore={claimsStore}
                    onMcGrade={(qi, grade) => setMcGrades(prev => ({ ...prev, [qi]: grade }))}
                  />
                ))}
              </div>
            </>
          ) : null}

          <div className="flex gap-2.5 justify-center flex-wrap mt-8 pt-6" style={{ borderTop: '1px solid var(--line-soft)' }}>
            {(() => {
              const clozeIncomplete = clozeWordCount > 0 && clozeAnswered < clozeWordCount;
              const isDisabled = alreadyFinished || clozeIncomplete;
              const label = alreadyFinished
                ? 'Already finished!'
                : clozeIncomplete
                  ? `${clozeAnswered}/${clozeWordCount} blanks filled in`
                  : 'Finish & see vocabulary results';
              // A new passage can only be generated once every blank in EVERY generated
              // passage today is filled in — not just the one currently being viewed —
              // AND the current passage has been explicitly finished via the Finish button.
              // It also requires due words: a passage is always built around due vocab now,
              // never a generic vocab-less one.
              const newPassageDisabled = !alreadyFinished || clozeIncomplete || loadingMore || !allPassagesComplete || dueDeckWords.size === 0;
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
                    onClick={() => loadMore()}
                    disabled={newPassageDisabled}
                    title={
                      newPassageDisabled && !loadingMore
                        ? dueDeckWords.size === 0
                          ? 'No words due for review — add more in Vocab to unlock a new passage'
                          : 'Fill in every blank in every passage to unlock a new one'
                        : undefined
                    }
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
