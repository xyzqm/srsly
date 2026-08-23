export type Theme = 'paper' | 'ink' | 'tea' | 'slate' | 'bone' | 'dusk';
export type Font = 'editorial-warm' | 'quiet-serif' | 'technical' | 'classic' | 'sans-modern';

/** Languages srsly can study. 'zh' = Mandarin Chinese, 'ja' = Japanese,
 *  'es' = Spanish, 'fr' = French. */
export type LanguageCode = 'zh' | 'ja' | 'es' | 'fr';

export interface DeckWord {
  id?: string;   // stable unique id; lets the same hanzi hold multiple readings (e.g. 行 xíng / háng)
  h: string;     // hanzi
  p: string;     // pinyin
  m: string;     // meaning (comma-separated if multiple)
  compounds?: string[]; // words carrying THIS reading (e.g. 行 háng → 银行, 行业); used to
                        // surface a reading that isn't natural standalone, in generated passages
  cn?: string;   // example sentence (HTML)
  en?: string;   // example translation
  reviews?: number;    // successful review count for mastery tracking
  dueAt?: string;      // YYYY-MM-DD next review date; absent = due immediately
  // FSRS scheduling fields (added after initial SRS migration)
  stability?: number;  // days until retrievability ≈ 90%
  difficulty?: number; // 1–10 card difficulty (higher = harder to remember)
  lapses?: number;     // number of times the card was forgotten (Again)
  lastReview?: string; // YYYY-MM-DD of most recent review
  // Learning phase fields
  phase?: 'learning' | 'review'; // 'learning' = in learning/relearning steps; 'review' = graduated; absent = new card
  learningStep?: number;          // 0-indexed step within the learning phase
  dueAtMs?: number;               // epoch-ms for sub-day scheduling (learning phase only)
  // Card-management state — srsly's take on Anki's flag/suspend/bury. Kept separate
  // from scheduling so they can be toggled without disturbing FSRS history.
  focus?: boolean;       // ★ user-starred "focus" word; filterable, never auto-cleared
  paused?: boolean;      // excluded from all review until resumed (cf. Anki "suspend")
  snoozeUntil?: string;  // YYYY-MM-DD; hidden from review until this date (cf. Anki "bury")
  leech?: boolean;       // auto-flagged after too many lapses (then auto-paused; re-suspends periodically)
  /**
   * The learner's own hook for remembering this word — a mnemonic, a context, a warning.
   *
   * Exists for leech triage. A card you have failed eight times is usually not failing for
   * want of another review; something about it is not sticking, and the fix is to change the
   * card rather than to keep showing it. Rendered on the flashcard's answer side.
   */
  note?: string;
  pool?: boolean;        // staged — added to deck but not yet in circulation; excluded from all review
}

export interface PassageToken {
  text: string;
  reading?: string; // pinyin (zh) or hiragana furigana (ja); always '' for es/fr, which
                    // are written in the same script they are read in
  meaning?: string; // only on vocab/free words
  type?: 'vocab' | 'free' | 'punct';
  /** Dictionary (lemma) form when `text` is inflected — a conjugated verb/adjective, a
   *  plural, or an elided French proclitic. Resolved server-side per language and
   *  used for cloze blank detection and grade attribution. */
  baseForm?: string;
}

export interface Sentence {
  tokens: PassageToken[];
  plainText: string;
}

export interface MCOption {
  tokens: PassageToken[];
  correct: boolean;
}

export interface Question {
  q: PassageToken[];
  model: string;        // model answer
  key: string[];        // key words to detect
  options: MCOption[];
}

export interface FillItem {
  before: PassageToken[];
  answer: [string, string]; // [text, reading]
  after: PassageToken[];
  options: Array<[string, string, boolean]>; // [text, reading, isCorrect]
}

export interface ConvoTurn {
  key: string[];
  tokens: PassageToken[];
  suggestions: PassageToken[][];
}

/**
 * One language's own streak, kept alongside the global one.
 *
 * Same three fields the global streak uses and the same functions operate on both — a
 * per-language streak is not a different rule, it is the same rule asked of a smaller deck.
 * That matters for the forgiveness check especially: "did I owe anything on the day I
 * missed" should mean "in THIS language", or studying Spanish would keep forgiving your
 * Chinese gaps.
 */
export interface LanguageStreak {
  streak: number;
  lastActive: string;
  forgivenDays?: string[];
}

export interface SRSState {
  streak: number;
  lastVisit: string;   // YYYY-MM-DD
  todayScore: number;  // -1 = not set
  todayScoreDate: string;
  sessions?: number;
  /** Last day the learner actually studied — a flashcard session OR finishing the daily
   *  reading. The streak is measured against this, NOT `todayScoreDate`: that one only
   *  moves when something is *graded*, so reading a passage with no comprehension
   *  questions left the streak untouched. Absent on states written before the honest
   *  streak; useSRS falls back to `todayScoreDate` once. See lib/streak.ts. */
  lastActive?: string;
  /**
   * Per-language streaks. The global `streak` above is unchanged and still answers "did you
   * study today" across everything; this answers it per language, so a Chinese streak is not
   * kept alive by a week of Spanish. Absent for states written before it existed, and for
   * languages never studied.
   */
  byLanguage?: Partial<Record<LanguageCode, LanguageStreak>>;
  /** Missed days forgiven because nothing was due — kept so the UI can say how much of a
   *  streak was rest rather than silently implying every day was studied. */
  forgivenDays?: string[];
  /** Per-day tally of passage cloze answers, oldest first, trimmed to ACCURACY_WINDOW days.
   *  Each blank is exactly one free-typed attempt (ClozeBlank refuses to re-grade), so this
   *  is a first-try figure by construction — a measure of recall, not of effort. */
  accuracy?: DailyAccuracy[];
}

/** One day's cloze tally. Short keys because this array is written on every answer. */
export interface DailyAccuracy { d: string; right: number; total: number }

export interface UserPrefs {
  theme: Theme;
  font: Font;
  language?: LanguageCode;   // active study language; absent = 'zh' (backward compat)
  hskLevel?: number;         // Chinese proficiency level 1–6 (used when language === 'zh')
  jlptLevel?: number;        // Japanese proficiency level 1–5, 5=N5 easiest (used when language === 'ja')
  cefrLevel?: number;        // Spanish proficiency level 1–6, 1=A1 easiest (used when language === 'es')
  // French also uses CEFR A1–C2, but gets its OWN key rather than sharing `cefrLevel` with
  // Spanish — the two are independent studies and one should not move the other's level.
  frLevel?: number;          // French proficiency level 1–6, 1=A1 easiest (used when language === 'fr')
  srsRetention?: number; // desired retention 0.70–0.99 (default 0.90)
  srsMaxDays?: number;   // maximum review interval in days (default 365)
  srsNewPerDay?: number;     // max new cards introduced per day (default 20)
  srsReviewsPerDay?: number; // max review cards shown per day (default 200)
  /**
   * Share of a passage that should be blanks, as a percentage. Replaces the old
   * `wordsPerPassage` count, which was pinned to the level it was set at: someone who chose
   * 4 words at A1 kept getting 4 in a C2 passage three times the length, and had no reason
   * to remember why their reading had gone thin. A density holds its meaning as passages
   * grow. Absent = RECOMMENDED_BLANK_DENSITY.
   */
  blankDensity?: number;
  /**
   * How many pooled words the Vocab tab's Activate button offers by default. Absent =
   * RECOMMENDED_POOL_ACTIVATE. A preference because the right batch depends on how much
   * new material you can absorb, which is the same judgement `srsNewPerDay` encodes.
   */
  poolActivateCount?: number;
  reverseCards?: boolean;    // Flashcards "Flip cards" — show meaning on the front, recall the word
  /**
   * Move a batch out of the pool automatically, once a day. Off unless chosen: it changes
   * how much work arrives without being asked, and a learner with a large pool should not
   * find it draining itself because they updated. See lib/poolAutoActivate.ts.
   */
  autoActivatePool?: boolean;
  /**
   * How the Read tab answers comprehension questions — typed ('fr') or multiple choice
   * ('mc'). A preference, not passage state: someone who works in multiple choice wants it
   * on the next passage too, and it used to reset to 'fr' every time the tab remounted.
   */
  readResponseMode?: ResponseMode;
  /** Highest level unlocked by PASSING ITS TEST, per language (see lib/unlock.ts). Levels
   *  unlocked by retention are derived from the deck and deliberately not stored — a
   *  persisted copy could disagree with the deck it was computed from. */
  testedLevels?: Partial<Record<LanguageCode, number>>;
  /** Languages where the placement test has been taken or skipped. */
  placementSeen?: Partial<Record<LanguageCode, boolean>>;
  /**
   * Languages the learner has actually added, in the order they added them.
   *
   * The app used to offer all four at all times, which made "what am I studying?" a
   * question with no answer and meant a level could never be established up front.
   * Absent means a pre-onboarding install — lib/onboarding.ts derives the list from the
   * decks that already exist rather than wiping anyone back to a blank slate.
   */
  languages?: LanguageCode[];
}

export interface ClaimedWords {
  vocab: string[];     // added to SRS deck
}

export type ResponseMode = 'fr' | 'mc';
export type TabId = 'read' | 'practice' | 'dash' | 'vocab' | 'settings';

/** One reading passage inside DailyContent. */
export interface DailyPassage {
  titleTokens: PassageToken[];
  sentences: Sentence[];
  vocabWords: string[];   // hanzi of the words targeted by this passage
  questions?: Question[];
  /**
   * Which dictionary sense each target word carries IN THIS PASSAGE, keyed by the word.
   *
   * A dictionary gloss is often several senses joined by ';' ("to want, wish, desire; to
   * expect; to think"), and dumping all of them into a hint tells the learner nothing about
   * the sentence in front of them. The generator picks the one that applies and returns it
   * here; the hint highlights it and dims the rest.
   *
   * A side-channel keyed by word rather than a per-token field, because for ja/es/fr the
   * model writes plain prose and the segmenting happens server-side afterwards — there is no
   * per-token slot for it to annotate. The cost is per-occurrence precision: a word used
   * twice with different senses gets one entry. Absent, or absent for a given word, means
   * "no single sense applies" and the full gloss is shown unhighlighted.
   */
  contextualMeanings?: Record<string, string>;
  /**
   * Text the learner pasted in, rather than a passage the model wrote around their due
   * words. Stored alongside the day's generated passages because everything a passage needs
   * — cloze state, the finished flag, the shelf, passage navigation — is already keyed by
   * date and passage index, and a second store would have to reimplement all of it.
   *
   * Two rules elsewhere read this flag, and both exist because a pasted passage is not a
   * generation: it never counts as "content was generated today" (so it can't suppress the
   * day's auto-generated passage), and it is exempt from the finish-everything gate on
   * "+ New passage" (a native article can be a hundred blanks long and abandoning one
   * shouldn't lock the day).
   */
  pasted?: boolean;
}

/** AI-generated daily practice content, cached in localStorage per day+level. */
export interface DailyContent {
  date: string;           // YYYY-MM-DD
  language?: LanguageCode; // study language; absent = 'zh' (backward compat)
  hskLevel: number;       // proficiency level in the active language (HSK 1–6 zh, JLPT 1–5 ja, CEFR 1–6 es/fr)
  passages: DailyPassage[];  // one per batch of ~5 due words
  fillItems: FillItem[];
  conversation: ConvoTurn[];
  // true when fill + conversation were AI-generated from this day's due words.
  // false/absent means they fell back to static content — the loader regenerates
  // such a cache (instead of serving stale static fill all day) the next time the
  // user has due words.
  complete?: boolean;
  // Which blocks were AI-generated (vs static fallback). Drives lazy per-tab
  // generation: each block is generated independently the first time its tab/mode
  // is opened, and merged into this cache. Absent = legacy cache (see migrateContent).
  sections?: { passage?: boolean; fill?: boolean; convo?: boolean };
}

/** A single independently-generated daily content block. */
export type ContentSection = 'passage' | 'fill' | 'convo';

export interface FRResponse {
  text: string;
  verdict: 'ok' | 'partial' | 'miss';
  message: string;
  wordsHit: string[];
}

/**
 * One passage kept on the shelf (lib/shelf.ts). Plain text rather than tokens — see the
 * note there on why the full DailyContent is not what gets archived.
 */
export interface ShelfEntry {
  /** "${date}|${language}|${level}|${passageIdx}" — stable, so re-shelving replaces. */
  id: string;
  date: string;            // YYYY-MM-DD
  language: LanguageCode;
  level: number;
  title: string;
  /**
   * Flattened text. KEPT, but only as a fallback for entries shelved before `sentences`
   * existed — everything written since carries tokens and renders from those.
   */
  text: string;
  /**
   * The passage as TOKENS, so a shelved passage stays a passage.
   *
   * Storing only flattened text made the shelf a dead archive: you could look at what you
   * read and nothing else. Tokens make every word clickable again — look one up a month
   * later, add it to your deck from there — and they make the entry re-renderable, which
   * flattened text is not. Passages shelved before commit 8c87283 had their spacing baked in
   * wrong and could never be fixed; with tokens, the same mistake would have been a
   * re-render.
   */
  sentences?: Sentence[];
  vocabWords: string[];    // the target words this passage was built around
  /** First-try blanks, when the passage had any. */
  score?: { correct: number; total: number };
  /**
   * Per-word outcome, so a shelved passage records WHICH words you got right, not just how
   * many. A bare "7/9" tells you nothing you can act on a month later; the two words you
   * missed are the whole reason to look back at it.
   *
   * One row per distinct word: a word blanked three times and missed once counts as missed,
   * because that is the answer worth remembering about it.
   */
  results?: { word: string; correct: boolean }[];
}

export interface ClozeGradeEntry { word: string; grade: number }
/** Per-passage cloze state keyed by occurrence ID "${sentenceIdx}-${tokenIdx}". */
export type ClozeOccurrenceMap = Record<string, ClozeGradeEntry>;
