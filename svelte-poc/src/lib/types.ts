export type Theme = 'paper' | 'ink' | 'tea' | 'slate' | 'bone' | 'dusk';
export type Font = 'editorial-warm' | 'quiet-serif' | 'technical' | 'classic' | 'sans-modern';

/** Languages srsly can study. 'zh' = Mandarin Chinese, 'ja' = Japanese. */
export type LanguageCode = 'zh' | 'ja';

import type { Card } from 'ts-fsrs';

/**
 * A vocabulary card. Extends ts-fsrs's `Card`, which supplies every scheduling field:
 * `due` (Date), `stability`, `difficulty`, `reps`, `lapses`, `state`, `learning_steps`,
 * `last_review` (Date). Because DeckWord *is* a Card, the ts-fsrs scheduler consumes and
 * returns DeckWords directly — no field mapping. `due`/`last_review` are Date objects in
 * memory and ISO strings in localStorage; the deck store revives them on load.
 */
export interface DeckWord extends Card {
  id?: string;   // stable unique id; lets the same hanzi hold multiple readings (e.g. 行 xíng / háng)
  h: string;     // hanzi
  p: string;     // pinyin
  m: string;     // meaning (comma-separated if multiple)
  pool?: boolean;        // staged — added to deck but not yet in circulation; excluded from all review
}

export interface PassageToken {
  text: string;
  reading?: string; // pinyin (zh) or hiragana furigana (ja)
  meaning?: string; // only on vocab/free words
  type?: 'vocab' | 'free' | 'punct';
  /** Japanese only: dictionary (lemma) form when `text` is a conjugated verb/adj that
   *  matches a due vocab word. Used for cloze blank detection and grade attribution. */
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
  srsRetention?: number; // desired retention 0.70–0.99 (default 0.90)
  srsMaxDays?: number;   // maximum review interval in days (default 365)
  srsNewPerDay?: number;     // max new cards introduced per day (default 20)
  srsReviewsPerDay?: number; // max review cards shown per day (default 200)
  wordsPerPassage?: number;  // vocab words to build each AI passage around; absent = level-based recommendation
  reverseCards?: boolean;    // Flashcards "Flip cards" — show meaning on the front, recall the word
  studyDeck?: string;    // LEGACY single-deck selection; migrated to studyDecks on load. absent/'' = all
  // Decks selected for the learning modes (read / fill / flashcards / conversation / cram).
  // '' represents the default (untagged) deck. Absent or empty array = all decks.
  studyDecks?: string[];
  decks?: string[];      // explicitly-created deck names (so empty decks persist)
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
}

/** AI-generated daily practice content, cached in localStorage per day+level. */
export interface DailyContent {
  date: string;           // YYYY-MM-DD
  language?: LanguageCode; // study language; absent = 'zh' (backward compat)
  hskLevel: number;       // proficiency level in the active language (HSK 1–6 for zh, JLPT 1–5 for ja)
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
  // The study deck this content was generated for (absent/'' = all decks). Part of
  // the cache identity so switching decks serves/generates the right passage.
  deck?: string;
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
