export type Theme = 'paper' | 'ink' | 'tea' | 'slate' | 'bone' | 'dusk';
export type Font = 'editorial-warm' | 'quiet-serif' | 'technical' | 'classic' | 'sans-modern';

export interface DeckWord {
  h: string;     // hanzi
  p: string;     // pinyin
  m: string;     // meaning (comma-separated if multiple)
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
}

export interface FRResponse {
  text: string;
  verdict: 'ok' | 'partial' | 'miss';
  message: string;
  wordsHit: string[];
}
