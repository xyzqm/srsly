import type { LanguageCode } from './types';

/** One proficiency tier shown in the Settings level picker. */
export interface LevelDescriptor {
  level: number;  // numeric level (1–6 for HSK; 1–5 for JLPT, where 5 = N5 = easiest)
  label: string;  // "HSK 3" | "JLPT N3"
  desc: string;   // one-line description for the Settings UI
}

/** Everything that differs between the languages srsly supports lives here. */
export interface LanguageConfig {
  code: LanguageCode;
  name: string;          // English name — "Chinese" | "Japanese"
  nativeName: string;    // "中文" | "日本語"
  htmlLang: string;      // value for <html lang> — "zh" | "ja"
  bcp47: string;         // TTS / speech-recognition locale — "zh-CN" | "ja-JP"
  levels: LevelDescriptor[];   // ordered easiest → hardest
  defaultLevel: number;
  deckKey: string;       // localStorage suffix for the vocab deck (srsly-vocab-deck-<deckKey>)
  /** Where the user's chosen proficiency level is stored on UserPrefs. */
  levelPrefKey: 'hskLevel' | 'jlptLevel';
  /** Whether the AI returns tokens with readings pre-annotated (true for ja). When false
   *  (zh) the client looks readings up from the bundled dictionary. */
  aiProvidesReadings: boolean;
  /** Grading instruction for /api/grade-response — which script the answer must be in. */
  answerScriptNote: string;
}

export const ZH_CONFIG: LanguageConfig = {
  code: 'zh',
  name: 'Chinese',
  nativeName: '中文',
  htmlLang: 'zh',
  bcp47: 'zh-CN',
  levels: [
    { level: 1, label: 'HSK 1', desc: 'Absolute beginner · ~150 words · greetings, numbers, basic nouns' },
    { level: 2, label: 'HSK 2', desc: 'Beginner · ~300 words · simple daily conversations' },
    { level: 3, label: 'HSK 3', desc: 'Elementary · ~600 words · familiar topics, travel, shopping' },
    { level: 4, label: 'HSK 4', desc: 'Intermediate · ~1,200 words · wide range of topics with fluency' },
    { level: 5, label: 'HSK 5', desc: 'Upper-intermediate · ~2,500 words · newspapers, TV, literature' },
    { level: 6, label: 'HSK 6', desc: 'Advanced · ~5,000 words · near-native comprehension' },
  ],
  defaultLevel: 3,
  deckKey: 'zh',
  levelPrefKey: 'hskLevel',
  aiProvidesReadings: false,
  answerScriptNote: 'The answer MUST be written in Chinese characters.',
};

export const JA_CONFIG: LanguageConfig = {
  code: 'ja',
  name: 'Japanese',
  nativeName: '日本語',
  htmlLang: 'ja',
  bcp47: 'ja-JP',
  // Ordered easiest → hardest (N5 → N1) so the Settings picker reads top-to-bottom.
  levels: [
    { level: 5, label: 'JLPT N5', desc: 'Absolute beginner · ~800 words · greetings and survival Japanese' },
    { level: 4, label: 'JLPT N4', desc: 'Beginner · ~1,500 words · familiar everyday topics' },
    { level: 3, label: 'JLPT N3', desc: 'Intermediate · ~3,700 words · everyday situations with nuance' },
    { level: 2, label: 'JLPT N2', desc: 'Upper-intermediate · ~6,000 words · newspapers and complex speech' },
    { level: 1, label: 'JLPT N1', desc: 'Advanced · ~10,000 words · near-native reading and listening' },
  ],
  defaultLevel: 4,   // N4 — comfortable beginner
  deckKey: 'ja',
  levelPrefKey: 'jlptLevel',
  aiProvidesReadings: true,
  answerScriptNote: 'The answer MUST be written in Japanese (hiragana, katakana, or kanji).',
};

/** Sentence count and recommended vocab-word range per level — longer/harder passages can
 *  carry more simultaneous vocab words without overwhelming the reader. Shared by the daily-
 *  content generator (sentence count) and the Settings UI (recommended words-per-passage). */
interface LevelShape { sentences: number; wordsMin: number; wordsMax: number }

const ZH_LEVEL_SHAPE: Record<number, LevelShape> = {
  1: { sentences: 7,  wordsMin: 3, wordsMax: 4 },
  2: { sentences: 8,  wordsMin: 3, wordsMax: 5 },
  3: { sentences: 9,  wordsMin: 4, wordsMax: 5 },
  4: { sentences: 10, wordsMin: 4, wordsMax: 6 },
  5: { sentences: 12, wordsMin: 5, wordsMax: 7 },
  6: { sentences: 14, wordsMin: 6, wordsMax: 8 },
};
/** JLPT: 5 = N5 easiest … 1 = N1 hardest. */
const JA_LEVEL_SHAPE: Record<number, LevelShape> = {
  5: { sentences: 6,  wordsMin: 3, wordsMax: 4 },
  4: { sentences: 8,  wordsMin: 4, wordsMax: 5 },
  3: { sentences: 10, wordsMin: 4, wordsMax: 6 },
  2: { sentences: 12, wordsMin: 5, wordsMax: 7 },
  1: { sentences: 14, wordsMin: 6, wordsMax: 8 },
};

function levelShape(lang: LanguageCode | undefined, level: number): LevelShape {
  const table = getLanguageConfig(lang).code === 'ja' ? JA_LEVEL_SHAPE : ZH_LEVEL_SHAPE;
  return table[level] ?? { sentences: 7, wordsMin: 4, wordsMax: 6 };
}

/** Sentences per passage for a level (used to size AI generation prompts). */
export function sentenceCountForLevel(lang: LanguageCode | undefined, level: number): number {
  return levelShape(lang, level).sentences;
}

/** Recommended [min, max] vocab words per passage for a level. */
export function recommendedWordsPerPassage(lang: LanguageCode | undefined, level: number): [number, number] {
  const { wordsMin, wordsMax } = levelShape(lang, level);
  return [wordsMin, wordsMax];
}

/** Default words-per-passage when the user hasn't set one — the midpoint of the recommended range. */
export function defaultWordsPerPassage(lang: LanguageCode | undefined, level: number): number {
  const [min, max] = recommendedWordsPerPassage(lang, level);
  return Math.round((min + max) / 2);
}

export const LANGUAGE_CONFIGS: Record<LanguageCode, LanguageConfig> = {
  zh: ZH_CONFIG,
  ja: JA_CONFIG,
};

/** Every language code srsly supports — the single list to iterate when an operation (cache
 *  refresh, a selector UI, a migration script) needs to touch "all languages". */
export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_CONFIGS) as LanguageCode[];

export function getLanguageConfig(lang: LanguageCode | undefined): LanguageConfig {
  return LANGUAGE_CONFIGS[lang ?? 'zh'];
}

/** Read the user's proficiency level for a language from prefs, falling back to its default. */
export function levelFor(lang: LanguageCode | undefined, prefs: { hskLevel?: number; jlptLevel?: number }): number {
  const cfg = getLanguageConfig(lang);
  return prefs[cfg.levelPrefKey] ?? cfg.defaultLevel;
}
