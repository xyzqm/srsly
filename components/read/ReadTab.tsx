'use client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Fragment, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { ResponseMode, FRResponse, DeckWord, ContentSection, ClozeOccurrenceMap, DailyPassage, UserPrefs } from '@/lib/types';
import { storage } from '@/lib/storage';
import { useLanguage } from '@/lib/LanguageContext';
import { levelFor, levelLabel, getLanguageConfig } from '@/lib/languageConfig';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { fsrsNextInterval, fmtInterval, type FsrsGrade } from '@/lib/fsrs';
import { useWordPopup } from '@/hooks/useWordPopup';
import { useClaims } from '@/hooks/useClaims';
import { useDailyContent } from '@/hooks/useDailyContent';
import { groupReadings } from '@/lib/readings';
import { dateInDays, isNewCard, isReadyNow, todayStr } from '@/lib/deck';
import { buildAnchorMap, type Anchor } from '@/lib/anchors';
import { bumpCount, getTodayCounts } from '@/lib/reviewCounts';
import { getSrsSettings } from '@/lib/fsrs';
import { selectClozeTargets, clozeKey } from '@/lib/clozeTargets';
import { needsSpaceBefore } from '@/lib/tokenText';
import ClickableWord from '@/components/shared/ClickableWord';
import WordPopup from './WordPopup';
import ReadabilityNote from './ReadabilityNote';
import { useReadability } from '@/hooks/useReadability';
import PassagePlayer from './PassagePlayer';
import PassageText from './PassageText';
import PassageSkeleton from './PassageSkeleton';
import ReadingSources from './ReadingSources';
import DailyProverb from './DailyProverb';
import AchievementToast from '@/components/stats/AchievementToast';
import { decodeClip, type WebClip } from '@/lib/webClip';
import NextSection from './NextSection';
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
  onNavigateSettings?: () => void;
  /**
   * Ask the app to switch study language, given a raw page language tag.
   *
   * Used only by the web clipper: a clip carries the language of the page it came from, and
   * segmenting a Spanish article as Chinese is nonsense. The app decides whether to honour it
   * — the tag may be junk, or a language this learner has not added.
   */
  onRequestLanguage?: (tag: string) => void;
  /**
   * Which half of the app this instance is.
   *
   * 'read' shows only what you brought — starter texts, pasted articles, clips, books — and
   * offers no generation. 'srs' shows only generated passages, which are written around the
   * words you owe today and carry the blanks. One component renders both because a passage
   * is a passage; the difference is which list it draws from and which controls it offers.
   */
  variant?: 'read' | 'srs';
  /** False while the tab is kept alive but hidden — see components/TabPanel.tsx. */
  active?: boolean;
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

export default function ReadTab({ onScore, onActivity, onAnswer, onRequireSignIn, onNavigateVocab, onNavigateSettings, onRequestLanguage, variant = 'read', active = true }: Props) {
  const { signedIn } = useAuth();
  const language = useLanguage();
  const langConfig = getLanguageConfig(language);
  const { deck, addWord, updateWord, updateWordReview, gradeCard } = useVocabDeck(language);
  // Latest deck, readable from a callback without making it depend on every deck change.
  const deckRef = useRef(deck);
  deckRef.current = deck;
  /** Brand-new words already charged to today's budget, so a word blanked twice costs one. */
  const spentNewRef = useRef<Set<string>>(new Set());

  /**
   * Proficiency level in the active language (HSK 1–6 / JLPT 5–1). 0 = not loaded yet.
   *
   * SEEDED SYNCHRONOUSLY FROM localStorage, for the same reason `savedLanguage()` in
   * app/page.tsx is: correcting itself a tick later is a visible wrong first frame, not a
   * detail. Every load began at 0, and 0 is what the passage skeleton keys on — so opening
   * the app always flashed a passage-shaped shimmer before anything knew whether a passage
   * existed. The async read below still runs and still wins; this only stops the first frame
   * from being a guess. Prefs are the cloud's write-through cache locally, so it is the same
   * value in all but the first moments of a second device.
   */
  const [hskLevel, setHskLevel] = useState(() => {
    if (typeof localStorage === 'undefined') return 0;
    try {
      const raw = localStorage.getItem('srsly-prefs');
      return raw ? levelFor(language, JSON.parse(raw) as UserPrefs) : 0;
    } catch {
      return 0;
    }
  });
  const [blankDensity, setBlankDensity] = useState<number | undefined>(undefined);

  /**
   * An article sent in by the web clipper, carried in the URL hash — see lib/webClip.ts.
   *
   * The hash is CLEARED as soon as it is read, for two reasons: refreshing the page should not
   * silently re-import the same article, and an 8,000-character fragment sitting in the address
   * bar is something the reader might copy and share without realising what is in it.
   */
  const [clip, setClip] = useState<WebClip | null>(null);
  useEffect(() => {
    // Read only. Both variants mount at once (TabPanel keeps tabs alive), and a clip is
    // someone's own article — if the SRS instance consumed the hash first it would clear it
    // and the Read instance would find nothing.
    if (variant !== 'read') return;
    const found = decodeClip(window.location.hash);
    if (!found) return;
    setClip(found);
    // Match the page's language before the text is analysed, so a Spanish article clipped
    // during a Chinese session is not segmented as Chinese.
    if (found.lang) onRequestLanguage?.(found.lang);
    history.replaceState(null, '', window.location.pathname + window.location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    storage.getPrefs().then(p => {
      setHskLevel(levelFor(language, p));
      setBlankDensity(p.blankDensity);
      if (p.readResponseMode) setResponseMode(p.readResponseMode);
    });
  }, [language]);

  // One deck per language, so passages always draw on the whole due queue.
  const { dailyContent, status: dailyStatus, loadMore, loadingMore, guestLimited, generateQuestionsForPassage, loadingQuestions, questionsError, addPastedPassage } = useDailyContent(
    hskLevel, deck, READ_WANT, language, blankDensity,
    // Same split as `passages` below: 'read' draws what the learner brought, 'srs' the rest.
    variant === 'srs' ? 'generated' : 'own',
  );

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

  /**
   * The passages THIS instance shows. `pasted` is the existing marker for "the learner
   * brought this" — set by buildPastedPassage, which every own-text source goes through —
   * so it already separates the two halves without a second field to keep in sync.
   */
  const visiblePassages = useMemo(
    () => (dailyContent?.passages ?? []).filter(p => (variant === 'srs' ? !p.pasted : !!p.pasted)),
    [dailyContent, variant],
  );
  const numPassages = visiblePassages.length;
  const [passageIdx, setPassageIdx] = useState(0);
  // Latest passage count, readable inside effects that shouldn't re-run on every change.
  const numPassagesRef = useRef(numPassages);
  numPassagesRef.current = numPassages;

  /**
   * ── A BOOK HAS ITS OWN READING SPACE ──────────────────────────────────────────────────
   *
   * A book section is NOT another entry in the passage list. Sections used to be appended to
   * it, so a novel's chapters were interleaved with pasted articles and generated passages,
   * and "passage 7 / 12" told you nothing about where you were in the book. Reading a novel
   * and dipping into an article at the same time meant paging past one to reach the other.
   *
   * So the book takes over while it is open, keeps its own position (already stored per book
   * in IndexedDB — see lib/epubProgress.ts), and closing it puts the passage list back exactly
   * as it was. Nothing about the list is disturbed in the meantime.
   */
  const [bookPassage, setBookPassage] = useState<DailyPassage | null>(null);

  // The book wins while it is open; otherwise the ordinary list.
  const currentPassage = bookPassage ?? visiblePassages[passageIdx];

  /**
   * The daily new-card budget AS IT STOOD WHEN THIS PASSAGE WAS OPENED.
   *
   * Deriving a target list from the live counter closes a feedback loop, and the loop bites
   * in the middle of a reading session: `selectClozeTargets` spends the budget to choose the
   * blanks, and answering one of those blanks charges the very same counter — so the next
   * time the selection is evaluated it has one fewer to spend, drops a word, and a blank
   * further down the page that you have not reached yet turns back into plain text. Measured
   * on a pasted article: three blanks chosen, the first answered, and the third silently
   * stopped being a blank while the reader was looking at it.
   *
   * "The memo's dependencies didn't change" is not a defence — useMemo is a performance hint
   * and React may recompute whenever it likes, so anything a memo reads from module state has
   * to be stable on its own. A generated passage never had this problem because its target
   * list is written once and stored; this snapshot gives a DERIVED list the same stability.
   *
   * It cannot double-spend: the words chosen against this snapshot are exactly the words
   * whose answers go on to charge it. The next passage opens against the updated count.
   */
  const budgetKey = `${dailyContent?.date ?? ''}|${language}|${hskLevel}|${passageIdx}`;
  const budgetRef = useRef<{ key: string; left: number } | null>(null);
  if (budgetRef.current?.key !== budgetKey) {
    budgetRef.current = { key: budgetKey, left: getSrsSettings().newPerDay - getTodayCounts().newCount };
  }
  const newBudgetAtOpen = budgetRef.current.left;

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

  /**
   * How much of THIS passage is at or below the learner's level.
   *
   * Read straight off the tokens the segmenter already produced, so it costs nothing and needs
   * no extra request — see lib/readability.ts on why raw text could not be measured client-side.
   */
  const readability = useReadability(
    useMemo(() => SENTENCES.flatMap(s => s.tokens), [SENTENCES]),
  );

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
   * This passage's target words — the recorded list, or DERIVED FROM THE PASSAGE ITSELF when
   * a generated one came back without any.
   *
   * That recovery path exists because everything downstream hangs off `vocabWords` — the
   * cloze blanks, the review-word count in the header, the words the finish handler schedules
   * — so an empty list used to degrade the passage to plain text under a header reading "add
   * words to your deck", indistinguishable from an empty deck and unrecoverable, because
   * nothing ever recomputed it.
   *
   * A PASTED PASSAGE IS NEVER DERIVED, even when its list is empty: it chose its targets at
   * paste time (see buildPastedPassage) and an empty list there is a real answer — "nothing
   * in this text fits today's budget" — not a missing one. Deriving anyway would let a
   * finished passage grow new blanks the moment grading pushed its old ones out of the due
   * queue, which is precisely what it did before this line existed.
   *
   * The rule itself — most overdue first, capped by density and by the shared new-card
   * ledger — lives in lib/clozeTargets.ts, because the paste panel's coverage readout has to
   * predict it exactly and a near-duplicate is how it would start lying.
   */
  const PASSAGE_VOCAB_SET = useMemo(() => {
    if (storedVocabWords.size > 0 || !currentPassage || currentPassage.pasted) return storedVocabWords;

    // One shared rule — see lib/clozeTargets.ts. The new-card budget applies here too:
    // this is a second way into the passage, and leaving it uncapped would reopen the hole
    // the shared ledger was built to close. A stored-target-list of [] is not a licence to
    // introduce the whole deck.
    const { words, blanks, tokens, candidates } = selectClozeTargets(
      currentPassage.sentences, deck, dueDeckWords, blankDensity, newBudgetAtOpen,
    );
    if (words.size === 0) return storedVocabWords;
    console.info(`[read] ${currentPassage.pasted ? 'pasted text' : 'passage stored no target words'}; selected ${words.size} of ${candidates} due (${blanks} of ${tokens} words blanked)`);
    return words;
  }, [storedVocabWords, currentPassage, dueDeckWords, deck, blankDensity, newBudgetAtOpen]);

  const targetWords = useMemo(
    () => deck.map(d => d.h).filter(h => PASSAGE_VOCAB_SET.has(h)),
    [deck, PASSAGE_VOCAB_SET]
  );

  const totalReviewWordCount = useMemo(() => {
    // Union rather than a fallback: a pasted passage carries no stored list, so a day
    // holding one generated passage and one pasted one would otherwise report only the
    // generated one's words and read as if the pasted text had none.
    const all = new Set([
      ...(dailyContent?.passages.flatMap(p => p.vocabWords) ?? []),
      ...PASSAGE_VOCAB_SET,
    ]);
    return all.size;
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
      if (isNewCard(w)) {
        seen.add(w.h);
        out.push(w);
      }
    }
    return out;
  }, [deck, clozeWords]);

  /**
   * Due new words this passage could not take because the daily budget ran out.
   *
   * The test is whether the budget is empty AFTER this passage's intake, not before it.
   * Checking "before" only fired once you were already at zero on arrival, so the common
   * case — eighteen spent, two taken here, eight still waiting — said nothing at all, which
   * is exactly when the learner most needs telling. Density-limited words are not counted:
   * this note names the daily limit, so it must only appear when the daily limit is what
   * stopped them.
   */
  const heldBackNew = useMemo(() => {
    if (!currentPassage) return 0;
    const takenNew = deck.filter(w => clozeWords.has(w.h) && isNewCard(w)).length;
    // Against the SAME snapshot the selection spent, not the live counter. Reading the
    // counter here counts this passage's own intake twice — once in `newCount` as blanks
    // get answered, once in `takenNew` — so a passage that took two of its two allowed new
    // words started reporting words as "held back" the moment you began filling them in.
    if (newBudgetAtOpen - takenNew > 0) return 0;
    return deck.filter(w => dueDeckWords.has(w.h) && !clozeWords.has(w.h) && isNewCard(w)).length;
  }, [deck, dueDeckWords, clozeWords, currentPassage, newBudgetAtOpen]);

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
        const key = clozeKey(t, clozeWords);
        // Same rule PassageText renders by, or the count and the page disagree.
        if (clozeWords.has(key) || clozeGrades.has(id)) { count++; distinct.add(key); ids.add(id); }
      });
    });
    return { clozeWordCount: count, clozeDistinctCount: distinct.size, blankIds: ids };
  }, [SENTENCES, clozeWords, clozeGrades]);

  /**
   * Is there enough passage to ask about?
   *
   * The route asks the model for five comprehension questions. Given "El camarón está aquí"
   * it has nothing to work with and comes back empty, which surfaced to the reader as
   * "Question generation returned nothing" — a sentence about our code, after a nine-second
   * wait and a spent AI credit, for a request that could never have succeeded.
   *
   * Measured in TOKENS, not characters, and requiring more than one sentence: a question
   * needs at least two facts to distinguish, and a single sentence gives one. The threshold
   * is deliberately low — this exists to catch the obviously impossible, not to judge what
   * makes a good passage.
   */
  const enoughToQuestion = useMemo(() => {
    const tokenCount = SENTENCES.reduce((n, s) => n + s.tokens.length, 0);
    return SENTENCES.length >= 2 && tokenCount >= 20;
  }, [SENTENCES]);

  const [activeSentence, setActiveSentence] = useState(0);
  // Loaded from prefs just below, and written back on every change — the Read tab unmounts
  // when you switch tabs, so held in state alone this silently reverted to 'fr'.
  const [responseMode, setResponseMode] = useState<ResponseMode>('fr');
  const chooseResponseMode = useCallback((mode: ResponseMode) => {
    setResponseMode(mode);
    storage.getPrefs().then(p => storage.savePrefs({ ...p, readResponseMode: mode }));
  }, []);
  const [showClozeHints, setShowClozeHints] = useState(true);
  /** The primer is open until the reader starts answering — see the block that renders it. */
  const [primerOpen, setPrimerOpen] = useState(true);
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
    // Every passage opens with its primer showing. Closing it is the reader's call and only
    // theirs — see the panel below.
    setPrimerOpen(true);
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

  /**
   * Comprehension answers, per passage.
   *
   * The blanks were already durable; the questions were not, and they are the slower half of
   * the work — a graded free response is a paragraph the reader wrote and an API round trip.
   * Switching tabs unmounts this component, so answering a question and glancing at Stats
   * threw both away. Same key shape as the cloze state, so the day-rollover sweep in
   * lib/storage/local.ts drops them together.
   */
  const qaKey = contentKey ? `srsly-qa|${contentKey}|${passageIdx}` : '';
  useEffect(() => {
    if (!qaKey) return;
    try {
      const raw = localStorage.getItem(qaKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { fr?: Record<number, FRResponse>; mc?: Record<number, FsrsGrade> };
      if (saved.fr) setFrResponses(saved.fr);
      if (saved.mc) setMcGrades(saved.mc);
    } catch { /* ignore */ }
  }, [qaKey]);

  useEffect(() => {
    // Never write the empty object: this effect also runs on the render right after a reset,
    // which would clobber the answers the restore above is about to read.
    if (!qaKey) return;
    const frCount = Object.keys(frResponses).length;
    const mcCount = Object.keys(mcGrades).length;
    if (frCount === 0 && mcCount === 0) return;
    try {
      localStorage.setItem(qaKey, JSON.stringify({ fr: frResponses, mc: mcGrades }));
    } catch { /* ignore */ }
  }, [frResponses, mcGrades, qaKey]);

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
        // Pasted text is exempt. This gate exists so a generated passage isn't abandoned
        // half-finished while another is generated on top of it; the learner's own article
        // is not a generation, can run to hundreds of blanks, and locking the rest of the
        // day behind finishing one would be a penalty for pasting.
        if (passage.pasted) return true;
        // Same rule as `clozeWords`, but scoped to each passage's own target words.
        const blankable = new Set(passage.vocabWords.filter(w => dueDeckWords.has(w)));
        let needed = 0;
        for (const s of passage.sentences) {
          for (const t of s.tokens) {
            if (t.type !== 'vocab') continue;
            if (blankable.has(clozeKey(t, blankable))) needed++;
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

  /**
   * Jump to a passage the reader just ASKED FOR — "+ new passage", or their own pasted text —
   * but never to one that merely turned up.
   *
   * It used to jump on any growth in the passage count, which was the same thing right up
   * until a passage could arrive on its own. The day's auto-generation lands 20–35s after the
   * tab opens, and it now appends rather than replaces, so without this flag it would pull the
   * reader off the article they pasted and were part-way through — resetting the active
   * sentence and clearing the cloze grades in view as it went.
   */
  const prevNumPassages = useRef(0);
  const didHydrate = useRef(false);
  const jumpOnArrival = useRef(false);
  useEffect(() => {
    // Consume the request on EVERY run, including the hydration path below. Clearing it only
    // where the jump happens leaves it armed when the requested passage was the first one:
    // pasting into an empty day lands on the hydration branch, which returns early, so the
    // flag survived and the day's generation — arriving minutes later and wanted by nobody —
    // spent it, yanking the reader off the article they were part-way through.
    const wanted = jumpOnArrival.current;
    jumpOnArrival.current = false;
    if (!didHydrate.current) {
      if (numPassages > 0) { didHydrate.current = true; prevNumPassages.current = numPassages; }
      return;
    }
    if (numPassages > prevNumPassages.current && wanted) {
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

  /** Both doors that add a passage on purpose ask to be taken to it. */
  const requestJump = useCallback(() => { jumpOnArrival.current = true; }, []);

  /** Open a book section — it replaces the view without touching the passage list. */
  const commitBookSection = useCallback((passage: DailyPassage) => {
    requestJump();
    setBookPassage(passage);
  }, [requestJump]);

  /** Put the book down. The list is exactly where it was, because it was never disturbed. */
  const closeBook = useCallback(() => setBookPassage(null), []);
  const commitPastedPassage = useCallback((passage: DailyPassage) => {
    requestJump();
    addPastedPassage(passage);
  }, [requestJump, addPastedPassage]);
  const generateMore = useCallback(() => {
    requestJump();
    return loadMore();
  }, [requestJump, loadMore]);

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
    if (card && isNewCard(card) && !spentNewRef.current.has(word)) {
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
        const days = deckWord ? fsrsNextInterval(deckWord, grade, undefined, { minDaysOut: 1 }) : 1;
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
        const days = card ? fsrsNextInterval(card, grade, undefined, { minDaysOut: 1 }) : 1;
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
      className="rounded-tr-xl rounded-b-xl px-4 py-5 sm:px-9 sm:py-8 animate-rise"
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
            {/* "Targeted reading", not "today's passage" — the passage is built around the
                words that are due, and naming the targeting is what explains why these
                sentences and not others. It also stops being a lie once the shelf holds
                several days' worth, or the reader pastes their own text. */}
            {variant === 'srs'
              ? (numPassages > 1
                  ? `Targeted reading · ${numPassages} passages · ${totalReviewWordCount} review word${totalReviewWordCount === 1 ? '' : 's'} total`
                  : `Targeted reading · ${totalReviewWordCount} review word${totalReviewWordCount === 1 ? '' : 's'}`)
              : 'Reading'}
            {dailyStatus === 'ready' && dailyContent?.sections?.passage && (
              <span style={{ fontSize: 9, letterSpacing: '.06em', background: 'var(--jade-soft)', color: 'var(--jade)', border: '1px solid color-mix(in srgb, var(--jade) 30%, transparent)', borderRadius: 4, padding: '1px 5px' }}>
                ✦ AI · {dailyContent.date}
              </span>
            )}
            {/* `loadingMore`, not the status. This read `dailyStatus === 'loading'`, which
                since generation moved to loadMore has meant "reading the cache and preloading
                the dictionary" and nothing else — so the badge announced a generation that
                was not happening, for as long as a 8 MB dictionary takes to arrive. */}
            {loadingMore && (
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
            {/* Same rule as the body below: shimmer only when there is no title to show. */}
            {(hskLevel === 0 || dailyStatus === 'restoring' || loadingMore) && !currentPassage ? (
              <div className="shimmer" style={{ height: 28, width: 140, borderRadius: 6, marginTop: 4 }} />
            ) : (
              <span style={{ fontFamily: 'var(--f-han)' }}>
                {TITLE_TOKENS.map((t, i) => {
                  // Deliberately no per-word state here. The title used to accent-underline
                  // its due target words, which quietly published the answer key: the marked
                  // words were exactly the ones the passage was about to blank out.
                  // The title goes through needsSpaceBefore like every other renderer. It
                  // used to lean on the '+' badge span after each word as an accidental
                  // spacer, which is why "La salud y el ejercicio" held together at all in
                  // Spanish — a superscript's width standing in for a space.
                  return (
                    <Fragment key={i}>
                      {needsSpaceBefore(TITLE_TOKENS, i, langConfig.scriptIsUnspaced)}
                      <ClickableWord token={t} onOpen={titlePopup.openPopup} showWordBoundaries={showWordBoundaries} />
                    </Fragment>
                  );
                })}
              </span>
            )}
          </div>
        </div>
        {/* Level sizes a GENERATED passage. Your own reading ignores levels entirely — see
            CLAUDE.md on levels being calibration, not a ladder — so stating one over a book
            chapter claimed a relationship that does not exist. */}
        <div className="flex flex-col items-end gap-2">
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.05em' }}>
            {variant === 'srs'
              ? <>level <span style={{ color: 'var(--jade)', fontWeight: 500 }}>{levelLabel(language, hskLevel)}</span> · ~{charCount} {langConfig.countUnit}</>
              : <>~{charCount} {langConfig.countUnit}</>}
          </div>
          {/* Information, never a gate — see ReadabilityNote. It sits BESIDE the passage rather
              than in front of it, and nothing is withheld at any figure. */}
          <div className="text-right"><ReadabilityNote readability={readability} /></div>
        </div>
      </div>

      {/* ── Reading a book ──────────────────────────────────────────────────────
          The bar that says where you are and how to get out. It replaces the passage
          nav rather than sitting beside it: paging between "passage 3 / 9" while inside
          a novel is the confusion this whole separation exists to remove. */}
      {bookPassage && (
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            📚 Reading a book
          </span>
          <button
            onClick={closeBook}
            className="cursor-pointer transition-all duration-150"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', background: 'none', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 10px', color: 'var(--ink-soft)' }}
          >
            ← close book
          </button>
          <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
            Your place is saved.
          </span>
        </div>
      )}

      {!bookPassage && dailyStatus === 'ready' && numPassages > 1 && (
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

      {/* Outside every branch below, deliberately. The paste panel is most wanted in the
          states where there is nothing to read — an empty deck, a failed generation, no API
          key at all — and those are exactly the branches that render instead of a passage. */}
      {/* Every source arrives by the same door: each hands back a DailyPassage through the
          identical onCommit, so a pasted article and a book chapter are passages like any
          other from here on. */}
      {/* Owns the gap to whatever follows it — the passage player sits immediately below and
          nothing there carries a top margin, so without this the dashed button and the play
          control touch. */}
      {variant === 'read' && hskLevel > 0 && (
        <div className="mb-5">
        <ReadingSources
          language={language}
          deck={deck}
          dueWords={dueDeckWords}
          blankDensity={blankDensity}
          onCommit={commitPastedPassage}
          onCommitBook={commitBookSection}
          emptyTab={!currentPassage}
          clip={clip}
        />
        </div>
      )}

      {/* The skeleton stands in for a passage that is not here yet — so it must not cover one
          that is. Generation runs for 20–35s with the paste panel live above it, and gating
          purely on `loading` meant a pasted article committed during that window was on disk,
          in state, and invisible: the reader clicked "Read this" and kept staring at a
          shimmer. Whenever there is something to read, read it; the generation carries on and
          appends its own passage when it lands. */}
      {(hskLevel === 0 || dailyStatus === 'restoring' || loadingMore) && !currentPassage ? (
        <>
          {loadingMore && (
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
              {/* An empty deck is not the same as a cleared queue, and this branch used to
                  tell both the same thing. "All caught up" to someone who has never added a
                  word congratulates them for work they have not done, and buries the one
                  instruction they actually need. */}
              {/* "above" means the reading cards, which exist only on the Read tab — on SRS
                  this sits under a heading with nothing above it at all. It also counted the
                  cards ("one of the four"), which stopped being true when audio was removed;
                  the copy no longer names a number it cannot keep in step with. */}
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-.01em' }}>
                {deck.length > 0 ? 'Ready when you are'
                  : variant === 'srs' ? 'Nothing to review yet'
                  : 'Start anywhere above'}
              </div>
              <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, lineHeight: 1.6, margin: '10px 0 24px', maxWidth: 400 }}>
                {deck.length === 0
                  ? variant === 'srs'
                    ? 'A passage here is written around the words you have due, so it needs a deck first. Open the Read tab and start anything — tap a word you do not know, and saving it schedules a review.'
                    : 'Open any of the readings above and start reading. Tap any word you do not know — you will get its definition, and saving it schedules a review. That is how the deck gets built; you do not have to fill it first.'
                  : totalReviewWordCount > 0
                    ? 'A passage will be written around the words you have due. It takes a few seconds and uses one AI generation, so it happens when you ask rather than the moment you open the app.'
                    : 'You have no words due for review today. Add new words to your deck to get a fresh passage built around them.'}
              </p>
              {/* No "add words in Vocab" button while the deck is EMPTY. It inverts the loop
                  the tab is built on: reading is what fills the deck, so sending a brand-new
                  learner to a word list first is asking them to do the hard, boring half
                  before they have seen why it is worth doing. The four reading cards above
                  are the instruction. Once there ARE words but none are due, Vocab is the
                  right destination and the button returns. */}
              {deck.length > 0 && (
              <button
                onClick={onNavigateVocab}
                className="cursor-pointer transition-all duration-150"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)' }}
              >
                Add words in Vocab
              </button>
              )}
            </>
          ) : variant === 'srs' ? (
            <>
              {/* The AI generator is deliberately SET APART from the four reading cards above,
                  and labelled with what it needs. It is the one feature in the app that costs
                  money, and presenting it alongside the free ones taught new learners that
                  srsly is a paid app that happens to be broken without a key — when in fact
                  reading your own text, a book or audio is the larger half and needs nothing.
                  A power feature, badged as one. */}
              <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  ✨ Or write one for me
                </span>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '.04em', background: 'var(--paper-2)', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 4, padding: '2px 6px' }}>
                  🔑 needs your API key
                </span>
              </div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-.01em' }}>
                {dailyStatus === 'no-key' ? 'Connect a key to write passages'
                  : dailyStatus === 'error' ? "Couldn't generate a passage"
                  : 'A passage built around your due words'}
              </div>
              <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, lineHeight: 1.6, margin: '10px 0 24px', maxWidth: 380 }}>
                {dailyStatus === 'no-key'
                  /* "above" is only true in the READ tab, where the four reading cards sit
                     directly over this block. In SRS there is nothing above it but the
                     "needs your API key" badge, so the sentence pointed at a badge saying the
                     opposite — the one place a learner is most likely to be confused about
                     what costs money. Same fact, aimed at where the free half actually is. */
                  ? `Writing a new passage is the one thing srsly cannot do for free, so it uses your own Anthropic key — about a cent a passage, billed to you and stored only in this browser. Everything else already works without one: ${variant === 'srs' ? 'your own text, a book or audio in the Read tab is' : 'add your own text, a book or audio above and it is'} segmented and blanked against your deck exactly the same way.`
                  : dailyStatus === 'error'
                    ? 'Something went wrong generating today’s passage. Try again.'
                    : `Written fresh around the words you have due today, at your level. ${variant === 'srs' ? 'Reading your own text in the Read tab is free and needs no key.' : 'Everything above is free and needs no key.'}`}
              </p>
              {/* The no-key state gets a route to Settings rather than a Generate button.
                  Generate cannot succeed — the server has already said there is no key — and
                  a button that reliably fails is worse than none; connecting a key is what
                  actually resolves the state, so that is what is offered. */}
              {dailyStatus === 'no-key' && onNavigateSettings && (
                <button
                  onClick={onNavigateSettings}
                  className="cursor-pointer transition-all duration-150"
                  style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, background: 'none', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 20px' }}
                >
                  Connect a key in Settings
                </button>
              )}
              {dailyStatus !== 'no-key' && (
                <button
                  onClick={() => generateMore()}
                  disabled={loadingMore}
                  className="cursor-pointer transition-all duration-150 disabled:opacity-45 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)' }}
                >
                  {loadingMore ? `Generating… ${genEstShort}` : 'Generate passage'}
                </button>
              )}
            </>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex gap-2 items-center mb-4 flex-wrap">
            {/* The panel stays mounted when you leave the tab, so playback would otherwise
                follow you onto Stats. `active` is what stops it. */}
            <PassagePlayer sentences={SENTENCES} onSentenceChange={setActiveSentence} active={active} />
            <div className="ml-auto flex gap-2 items-center flex-wrap">
              {/* Scoped to ONE thing: the English meaning shown when you hover a blank.
                  It briefly also gated the letter-by-letter colouring as you type, which
                  made "off" mean two different kinds of help at once; the colouring is
                  feedback on what you have already typed, not a hint about what to type,
                  so it stays on and this switch is about the meaning alone. */}
              {/* Only where there ARE blanks. Your own reading has none, so the toggle
                  offered to hide a hint about nothing. */}
              {clozeWordCount > 0 && (
                <button
                  style={toggleStyle(showClozeHints)}
                  onClick={() => setShowClozeHints(v => !v)}
                  title={showClozeHints
                    ? 'Hovering a blank shows its English meaning'
                    : 'No meaning on hover — recall the word, then type it'}
                >
                  Hints
                </button>
              )}
              {/* Only for scripts that don't delimit their own words. In Spanish and French
                  every space is already a boundary, so the toggle offered a choice between
                  "correct" and "correct with underlines" — a decoration masquerading as a
                  practice mode. */}
              {langConfig.scriptIsUnspaced && (
                <button style={toggleStyle(showWordBoundaries)} onClick={() => setShowWordBoundaries(v => !v)}>
                  Boundaries
                </button>
              )}
            </div>
          </div>

          {/* Teach, then test — with the emphasis on THEN.
              These are the passage's brand-new words, named before you read rather than
              sprung on you as a blank you have no way to fill. Left open while you work it is
              also an answer key: these are exactly the words about to be blanked, sitting a
              few lines above the gaps with their meanings attached.
              It used to close itself the moment you answered anything. That was the app
              deciding when you had finished reading — sometimes mid-word, on a list you were
              still using. It now closes only when you press hide, and the copy says why you
              might want to. */}
          {primerWords.length > 0 && (
            <div
              className="rounded-[11px] px-5 py-4 mb-4"
              style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
            >
              <button
                onClick={() => setPrimerOpen(v => !v)}
                className="cursor-pointer w-full flex items-center justify-between gap-3"
                style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
                aria-expanded={primerOpen}
              >
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  New words to know · {primerWords.length}
                </span>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  {primerOpen ? 'hide' : 'show'}
                </span>
              </button>
              {primerOpen && (<>
              <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '5px 0 10px', maxWidth: '52ch' }}>
                You haven&apos;t seen {primerWords.length === 1 ? 'this one' : 'these'} before. Read {primerWords.length === 1 ? 'it' : 'them'} now — the passage will ask you to fill {primerWords.length === 1 ? 'it' : 'them'} in.{' '}
                {/* A suggestion, not a rule, and placed where it can still be acted on: once
                    the panel is collapsed, advice about collapsing it is just noise. */}
                <span style={{ color: 'var(--ink-soft)' }}>
                  Worth hiding {primerWords.length === 1 ? 'it' : 'them'} before you start filling in the blanks — {primerWords.length === 1 ? 'it is' : 'they are'} the answers.
                </span>
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
              </>)}
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

      {dailyStatus === 'restoring' && (
        <div className="mt-8 pt-8" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="shimmer" style={{ height: 14, width: 180, borderRadius: 4, marginBottom: 22 }} />
          <div className="shimmer" style={{ height: 96, borderRadius: 10, marginBottom: 14 }} />
          <div className="shimmer" style={{ height: 96, borderRadius: 10, marginBottom: 14 }} />
          <div className="shimmer" style={{ height: 96, borderRadius: 10 }} />
        </div>
      )}

      {dailyStatus !== 'restoring' && currentPassage && (
        <>
          <div className="h-px my-8" style={{ background: 'var(--line)' }} />

          {QUESTIONS.length === 0 && currentPassage ? (
            <div className="flex flex-col items-center gap-2 py-2 mb-4">
              {loadingQuestions ? (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-faint)', letterSpacing: '.06em' }}>
                  Generating questions…
                </div>
              ) : !enoughToQuestion ? (
                <p style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.5, textAlign: 'center', maxWidth: '44ch', margin: 0 }}>
                  Too short for comprehension questions — paste a few more sentences and the
                  option appears.
                </p>
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
              {/* Say why nothing happened. The button used to swallow every failure and
                  return, so an exhausted AI budget looked identical to a button that did
                  nothing at all. */}
              {!loadingQuestions && questionsError && (
                <p style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--accent)', lineHeight: 1.5, textAlign: 'center', maxWidth: '46ch', margin: 0 }}>
                  {showGuestLimit
                    ? "You've used your free AI generations — sign in for unlimited questions."
                    : `Couldn't generate questions: ${questionsError}`}
                </p>
              )}
            </div>
          ) : QUESTIONS.length > 0 ? (
            <>
              <div className="flex justify-between items-center flex-wrap gap-2.5 mb-4">
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  Reading comprehension · {QUESTIONS.length} questions
                </span>
                <div className="flex gap-1.5">
                  <button style={toggleStyle(responseMode === 'fr')} onClick={() => chooseResponseMode('fr')}>Free response</button>
                  <button style={toggleStyle(responseMode === 'mc')} onClick={() => chooseResponseMode('mc')}>Multiple choice</button>
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
                    savedMcGrade={mcGrades[i]}
                  />
                ))}
              </div>
            </>
          ) : null}

          {/* The finish row belongs to BLANKS, so it appears only where there are any.
              Own reading grades nothing, so "Finish & see vocabulary results" reported on an
              empty set and the vocabulary results screen behind it had nothing to show. */}
          {clozeWordCount > 0 && (
          <div className="flex gap-2.5 justify-center flex-wrap mt-8 pt-6" style={{ borderTop: '1px solid var(--line-soft)' }}>
            {(() => {
              const clozeIncomplete = clozeWordCount > 0 && clozeAnswered < clozeWordCount;
              // Finishing is NOT gated on filling every blank. Blank count is `tokens ×
              // density` with no ceiling, so on a long section with a big deck that gate put
              // the results screen — and the proverb behind it — out of reach entirely. It
              // grades what was filled; leaving blanks empty simply forgoes those grades.
              const isDisabled = alreadyFinished;
              const label = alreadyFinished
                ? 'Already finished!'
                : clozeIncomplete
                  ? `Finish · ${clozeAnswered}/${clozeWordCount} blanks filled`
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
                    onClick={() => generateMore()}
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
          )}

          {showResults && <VocabResults results={vocabResults} />}
          {/* The reward, and only on a screen that says you finished. Shown for a GENERATED
              passage — the SRS drill — because `showResults` only exists where blanks do.
              `AchievementToast` belongs here for the same reason and was simply missing: this
              is the second of the two "you finished" screens its own docstring describes, so a
              milestone crossed on the last blank of a passage had nowhere to be announced. */}
          {showResults && <AchievementToast />}
          {showResults && <DailyProverb />}
          {showResults && (() => {
            const missedSet = new Set(missedWords.map(w => w.h));
            const reviewWords = [...missedWords, ...sessionAddedWords.filter(w => !missedSet.has(w.h))];
            const cacheKey = contentKey ? `srsly-missed-sentences|${contentKey}|${passageIdx}` : undefined;
            return <MissedWordReview words={reviewWords} missedCount={missedWords.length} cacheKey={cacheKey} language={language} level={hskLevel} />;
          })()}

          {/* Carry on with the book, if one is open. Above the proverb, because it is the
              action and the proverb is the send-off. Renders nothing unless a book is
              actually being read.

              NOT gated on `showResults`. Finishing requires every blank filled, so gating the
              next section on it put the rest of the novel behind a perfect score on this
              slice — the reading is the point, and the blanks are practice along the way.
              Anything left unfilled is simply not graded, which is the learner's call. */}
          {/* Advancing goes back into the BOOK, not onto the passage list — otherwise
              "next section" would quietly turn the novel into a pile of articles.
              Read only: the SRS tab has no shelf and nothing to carry on with. */}
          {variant === 'read' && (
            <NextSection
              language={language}
              deck={deck}
              dueWords={dueDeckWords}
              blankDensity={blankDensity}
              onCommit={commitBookSection}
            />
          )}

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
