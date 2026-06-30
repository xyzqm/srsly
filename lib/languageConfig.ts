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

export const LANGUAGE_CONFIGS: Record<LanguageCode, LanguageConfig> = {
  zh: ZH_CONFIG,
  ja: JA_CONFIG,
};

export function getLanguageConfig(lang: LanguageCode | undefined): LanguageConfig {
  return LANGUAGE_CONFIGS[lang ?? 'zh'];
}

/** Read the user's proficiency level for a language from prefs, falling back to its default. */
export function levelFor(lang: LanguageCode | undefined, prefs: { hskLevel?: number; jlptLevel?: number }): number {
  const cfg = getLanguageConfig(lang);
  return prefs[cfg.levelPrefKey] ?? cfg.defaultLevel;
}
