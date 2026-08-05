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

export interface SRSState {
  streak: number;
  lastVisit: string;   // YYYY-MM-DD
  todayScore: number;  // -1 = not set
  todayScoreDate: string;
  sessions?: number;
}

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
  wordsPerPassage?: number;  // vocab words to build each AI passage around; absent = level-based recommendation
  reverseCards?: boolean;    // Flashcards "Flip cards" — show meaning on the front, recall the word
}

export interface ClaimedWords {
  vocab: string[];     // added to SRS deck
}

export type ResponseMode = 'fr' | 'mc';
export type TabId = 'read' | 'practice' | 'dash' | 'vocab' | 'settings';
export type PracticeMode = 'flash' | 'fill' | 'convo' | 'cram';

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

export interface ClozeGradeEntry { word: string; grade: number }
/** Per-passage cloze state keyed by occurrence ID "${sentenceIdx}-${tokenIdx}". */
export type ClozeOccurrenceMap = Record<string, ClozeGradeEntry>;
