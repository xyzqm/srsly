export type Theme = 'paper' | 'ink' | 'tea' | 'slate' | 'bone' | 'dusk';
export type Font = 'editorial-warm' | 'quiet-serif' | 'technical' | 'classic' | 'sans-modern';

export interface DeckWord {
  h: string;   // hanzi
  p: string;   // pinyin
  m: string;   // meaning (comma-separated if multiple)
  cn?: string; // example sentence (HTML)
  en?: string; // example translation
  reviews?: number; // correct review count for mastery tracking
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
}

export interface ClaimedWords {
  vocab: string[];     // added to SRS deck
  tomorrow: string[];  // one-time preview
}

export type ResponseMode = 'fr' | 'mc';
export type TabId = 'read' | 'practice' | 'dash' | 'vocab' | 'settings';
export type PracticeMode = 'flash' | 'fill' | 'convo';

export interface FRResponse {
  text: string;
  verdict: 'ok' | 'partial' | 'miss';
  message: string;
  wordsHit: string[];
}
