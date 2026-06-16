export type Theme = 'paper' | 'ink' | 'tea' | 'slate' | 'bone' | 'dusk';
export type Font = 'editorial-warm' | 'quiet-serif' | 'technical' | 'classic' | 'sans-modern';

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
  deck?: string;         // optional deck/group name; absent = the default deck
}

export interface PassageToken {
  text: string;
  pinyin?: string;
  meaning?: string; // only on vocab/free words
  type?: 'vocab' | 'free' | 'punct';
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
  answer: [string, string]; // [hanzi, pinyin]
  after: PassageToken[];
  options: Array<[string, string, boolean]>; // [hanzi, pinyin, isCorrect]
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
  hskLevel?: number;
  srsRetention?: number; // desired retention 0.70–0.99 (default 0.90)
  srsMaxDays?: number;   // maximum review interval in days (default 365)
  studyDeck?: string;    // currently-selected deck to study; absent/'' = all decks
}

export interface ClaimedWords {
  vocab: string[];     // added to SRS deck
  tomorrow: string[];  // one-time preview
}

export type ResponseMode = 'fr' | 'mc';
export type TabId = 'read' | 'practice' | 'dash' | 'vocab' | 'settings';
export type PracticeMode = 'flash' | 'fill' | 'convo';

/** One reading passage inside DailyContent. */
export interface DailyPassage {
  titleTokens: PassageToken[];
  sentences: Sentence[];
  vocabWords: string[];   // hanzi of the words targeted by this passage
  questions?: Question[];
}

/** AI-generated daily practice content, cached in localStorage per day+level. */
export interface DailyContent {
  date: string;           // YYYY-MM-DD
  hskLevel: number;
  passages: DailyPassage[];  // one per batch of ~5 due words
  fillItems: FillItem[];
  conversation: ConvoTurn[];
  // true when fill + conversation were AI-generated from this day's due words.
  // false/absent means they fell back to static content — the loader regenerates
  // such a cache (instead of serving stale static fill all day) the next time the
  // user has due words.
  complete?: boolean;
  // The study deck this content was generated for (absent/'' = all decks). Part of
  // the cache identity so switching decks serves/generates the right passage.
  deck?: string;
}

export interface FRResponse {
  text: string;
  verdict: 'ok' | 'partial' | 'miss';
  message: string;
  wordsHit: string[];
}
