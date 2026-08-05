import type { LanguageCode } from './types';

/** Broad difficulty tier, used to pitch AI generation prompts. Stated per level rather
 *  than derived from the number, because the numbering runs in opposite directions
 *  (HSK 6 and CEFR C2 are hardest; JLPT N1 is hardest). */
export type DifficultyTier = 'beginner' | 'intermediate' | 'advanced';

/** One proficiency tier shown in the Settings level picker. */
export interface LevelDescriptor {
  level: number;  // numeric level (1–6 for HSK/CEFR; 1–5 for JLPT, where 5 = N5 = easiest)
  label: string;  // "HSK 3" | "JLPT N3" | "B1"
  badge: string;  // compact form for the level chip — "3" | "N3" | "B1"
  desc: string;   // one-line description for the Settings UI
  tier: DifficultyTier;
}

/** Sentence count and recommended vocab-word range for one level — longer/harder passages
 *  can carry more simultaneous vocab words without overwhelming the reader. Shared by the
 *  daily-content generator (sentence count) and the Settings UI (words-per-passage). */
export interface LevelShape { sentences: number; wordsMin: number; wordsMax: number }

/**
 * Everything that differs between the languages srsly supports lives here. Adding a
 * language should mean adding one of these plus its dictionary data — resist reaching
 * for `language === 'xx'` checks in components and routes, and put the difference on
 * this config instead.
 */
export interface LanguageConfig {
  code: LanguageCode;
  name: string;          // English name — "Chinese" | "Japanese" | "Spanish"
  nativeName: string;    // "中文" | "日本語" | "Español"
  htmlLang: string;      // value for <html lang> — "zh" | "ja" | "es"
  bcp47: string;         // TTS / speech-recognition locale — "zh-CN" | "ja-JP" | "es-ES"
  levels: LevelDescriptor[];   // ordered easiest → hardest
  defaultLevel: number;
  deckKey: string;       // localStorage suffix for the vocab deck (srsly-vocab-deck-<deckKey>)
  /** Where the user's chosen proficiency level is stored on UserPrefs. */
  levelPrefKey: 'hskLevel' | 'jlptLevel' | 'cefrLevel' | 'frLevel';
  /** Whether the AI returns tokens with readings pre-annotated (true for ja). When false
   *  (zh) the client looks readings up from the bundled dictionary. Meaningless when
   *  `hasReadings` is false. */
  aiProvidesReadings: boolean;
  /**
   * Whether words in this language carry a phonetic reading at all — pinyin (zh) or
   * furigana (ja). FALSE for Spanish, which is written in the same alphabet it is read
   * in. When false the DeckWord `p` slot stays empty, no reading overlay is rendered
   * above tokens, and a token qualifies as vocab on its MEANING alone (a reading-gated
   * check would classify every Spanish word as ordinary text).
   */
  hasReadings: boolean;
  /** Whether tokens can carry a dictionary/base form in RawTok's 4th element — true for
   *  languages with inflection we resolve server-side (ja conjugation, es conjugation
   *  and plurals). */
  usesBaseForms: boolean;
  /**
   * How passage text arrives from the model:
   *   'pipe'   — the model self-segments with | between tokens (zh)
   *   'server' — the model writes plain prose and we segment it server-side (ja via
   *              kuromoji, es via whitespace/punctuation splitting)
   */
  segmentation: 'pipe' | 'server';
  /** Whether the script is written without spaces between words, so a run of characters
   *  has to be split and re-merged against the dictionary (true for zh). */
  scriptIsUnspaced: boolean;
  /** Matches a single "word character" — used by the paste-import parsers. */
  wordCharRe: RegExp;
  /** Heading for the level picker in Settings. */
  levelSectionLabel: string;
  /** Sentence/word shape per level, keyed by the level number. */
  levelShape: Record<number, LevelShape>;
  /** Representative character shown in loading/placeholder UI. */
  glyph: string;
  /** Unit the passage-length counter is expressed in. Unspaced scripts count characters;
   *  spaced ones count words, since a character count says nothing useful about Spanish. */
  countUnit: string;
  /** Name of the bundled dictionary, shown in import copy. */
  dictName: string;
  /** Three example words used as the paste-import placeholder. */
  sampleWords: [string, string, string];
  /** Copy for the "add a word" form. Kept here rather than branched in the component so
   *  adding a language stays a config change. The reading fields are unused — and the
   *  reading input is not rendered at all — when `hasReadings` is false. */
  wordFieldLabel: string;
  wordFieldPlaceholder: string;
  readingLabel: string;
  readingHelp: string;
  readingHint: string;
  /** How to express "keep it short" when asking the AI for an example sentence. Character
   *  counts describe CJK well but not Spanish, where a word count is the natural unit. */
  shortSentenceLimit: string;
  /** Grading instruction for /api/grade-response — which script the answer must be in. */
  answerScriptNote: string;
}

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
/** CEFR: 1 = A1 easiest … 6 = C2 hardest, same direction as HSK. Spanish sentences carry
 *  fewer characters per idea than Chinese, so passages run slightly longer per level. */
const ES_LEVEL_SHAPE: Record<number, LevelShape> = {
  1: { sentences: 6,  wordsMin: 3, wordsMax: 4 },
  2: { sentences: 8,  wordsMin: 3, wordsMax: 5 },
  3: { sentences: 10, wordsMin: 4, wordsMax: 6 },
  4: { sentences: 11, wordsMin: 4, wordsMax: 6 },
  5: { sentences: 13, wordsMin: 5, wordsMax: 7 },
  6: { sentences: 14, wordsMin: 6, wordsMax: 8 },
};

/** CEFR again, same direction and same tier sizes as Spanish. */
const FR_LEVEL_SHAPE: Record<number, LevelShape> = {
  1: { sentences: 6,  wordsMin: 3, wordsMax: 4 },
  2: { sentences: 8,  wordsMin: 3, wordsMax: 5 },
  3: { sentences: 10, wordsMin: 4, wordsMax: 6 },
  4: { sentences: 11, wordsMin: 4, wordsMax: 6 },
  5: { sentences: 13, wordsMin: 5, wordsMax: 7 },
  6: { sentences: 14, wordsMin: 6, wordsMax: 8 },
};

export const ZH_CONFIG: LanguageConfig = {
  code: 'zh',
  name: 'Chinese',
  nativeName: '中文',
  htmlLang: 'zh',
  bcp47: 'zh-CN',
  levels: [
    { level: 1, label: 'HSK 1', badge: '1', tier: 'beginner',     desc: 'Absolute beginner · ~150 words · greetings, numbers, basic nouns' },
    { level: 2, label: 'HSK 2', badge: '2', tier: 'beginner',     desc: 'Beginner · ~300 words · simple daily conversations' },
    { level: 3, label: 'HSK 3', badge: '3', tier: 'intermediate', desc: 'Elementary · ~600 words · familiar topics, travel, shopping' },
    { level: 4, label: 'HSK 4', badge: '4', tier: 'intermediate', desc: 'Intermediate · ~1,200 words · wide range of topics with fluency' },
    { level: 5, label: 'HSK 5', badge: '5', tier: 'advanced',     desc: 'Upper-intermediate · ~2,500 words · newspapers, TV, literature' },
    { level: 6, label: 'HSK 6', badge: '6', tier: 'advanced',     desc: 'Advanced · ~5,000 words · near-native comprehension' },
  ],
  defaultLevel: 3,
  deckKey: 'zh',
  levelPrefKey: 'hskLevel',
  aiProvidesReadings: false,
  hasReadings: true,
  usesBaseForms: false,
  segmentation: 'pipe',
  scriptIsUnspaced: true,
  wordCharRe: /[一-鿿]/,
  levelSectionLabel: 'HSK level',
  levelShape: ZH_LEVEL_SHAPE,
  glyph: '话',
  countUnit: '字',
  dictName: 'CC-CEDICT (121k entries)',
  sampleWords: ['学习', '工作', '朋友'],
  wordFieldLabel: 'Hanzi',
  wordFieldPlaceholder: '垃圾',
  readingLabel: 'Pinyin',
  readingHelp: '(lv4 for lǜ · no number = neutral tone e.g. le)',
  readingHint: 'type with tone numbers e.g. shui3bei1',
  shortSentenceLimit: 'under 20 characters',
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
    { level: 5, label: 'JLPT N5', badge: 'N5', tier: 'beginner',     desc: 'Absolute beginner · ~800 words · greetings and survival Japanese' },
    { level: 4, label: 'JLPT N4', badge: 'N4', tier: 'beginner',     desc: 'Beginner · ~1,500 words · familiar everyday topics' },
    { level: 3, label: 'JLPT N3', badge: 'N3', tier: 'intermediate', desc: 'Intermediate · ~3,700 words · everyday situations with nuance' },
    { level: 2, label: 'JLPT N2', badge: 'N2', tier: 'intermediate', desc: 'Upper-intermediate · ~6,000 words · newspapers and complex speech' },
    { level: 1, label: 'JLPT N1', badge: 'N1', tier: 'advanced',     desc: 'Advanced · ~10,000 words · near-native reading and listening' },
  ],
  defaultLevel: 4,   // N4 — comfortable beginner
  deckKey: 'ja',
  levelPrefKey: 'jlptLevel',
  aiProvidesReadings: true,
  hasReadings: true,
  usesBaseForms: true,
  segmentation: 'server',
  scriptIsUnspaced: true,
  wordCharRe: /[一-鿿぀-ヿ]/,
  levelSectionLabel: 'JLPT level',
  levelShape: JA_LEVEL_SHAPE,
  glyph: '話',
  countUnit: '字',
  dictName: 'JMdict',
  sampleWords: ['勉強', '仕事', '友達'],
  wordFieldLabel: 'Word',
  wordFieldPlaceholder: '言葉',
  readingLabel: 'Reading',
  readingHelp: '(hiragana / katakana)',
  readingHint: 'type the reading in hiragana',
  shortSentenceLimit: 'under 25 characters',
  answerScriptNote: 'The answer MUST be written in Japanese (hiragana, katakana, or kanji).',
};

/**
 * Spanish. The first language srsly supports with no reading layer and no unspaced
 * script — `hasReadings: false` is what stops the UI drawing an empty pinyin/furigana
 * slot above every word, and what makes the token pipeline classify vocab by meaning
 * instead of by whether a reading resolved.
 *
 * Levels are CEFR A1–C2. Note that unlike HSK and JLPT these are not backed by an
 * official published word list — see the caveat in lib/data/cefr-levels.ts.
 */
export const ES_CONFIG: LanguageConfig = {
  code: 'es',
  name: 'Spanish',
  nativeName: 'Español',
  htmlLang: 'es',
  bcp47: 'es-ES',
  levels: [
    { level: 1, label: 'A1', badge: 'A1', tier: 'beginner',     desc: 'Absolute beginner · ~500 words · greetings, numbers, everyday objects' },
    { level: 2, label: 'A2', badge: 'A2', tier: 'beginner',     desc: 'Beginner · ~1,500 words · routine exchanges on familiar matters' },
    { level: 3, label: 'B1', badge: 'B1', tier: 'intermediate', desc: 'Intermediate · ~3,000 words · travel, work, opinions and plans' },
    { level: 4, label: 'B2', badge: 'B2', tier: 'intermediate', desc: 'Upper-intermediate · ~5,000 words · abstract topics with fluency' },
    { level: 5, label: 'C1', badge: 'C1', tier: 'advanced',     desc: 'Advanced · ~8,000 words · implicit meaning, journalism, literature' },
    { level: 6, label: 'C2', badge: 'C2', tier: 'advanced',     desc: 'Mastery · ~12,000 words · near-native precision and nuance' },
  ],
  defaultLevel: 2,   // A2 — comfortable beginner
  deckKey: 'es',
  levelPrefKey: 'cefrLevel',
  aiProvidesReadings: false,
  hasReadings: false,
  usesBaseForms: true,
  segmentation: 'server',
  scriptIsUnspaced: false,
  wordCharRe: /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/,
  levelSectionLabel: 'CEFR level',
  levelShape: ES_LEVEL_SHAPE,
  glyph: 'á',
  countUnit: 'words',
  dictName: 'Wiktionary (108k entries)',
  sampleWords: ['estudiar', 'trabajo', 'amigo'],
  wordFieldLabel: 'Word',
  wordFieldPlaceholder: 'ciudad',
  // Spanish has no reading layer, so these three are never shown — see `hasReadings`.
  readingLabel: '',
  readingHelp: '',
  readingHint: '',
  shortSentenceLimit: 'under 12 words',
  answerScriptNote: 'The answer MUST be written in Spanish.',
};

function levelShape(lang: LanguageCode | undefined, level: number): LevelShape {
  return getLanguageConfig(lang).levelShape[level] ?? { sentences: 7, wordsMin: 4, wordsMax: 6 };
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

/**
 * French. Structurally the closest language to Spanish in this app: no reading layer
 * (`hasReadings: false`), space-delimited, server-segmented, and graded on CEFR — so it
 * reuses the same spacing/rendering and token paths rather than needing new ones.
 *
 * Its levels get their OWN pref key (`frLevel`) rather than sharing Spanish's `cefrLevel`.
 * Both are CEFR, but they are independent studies: setting your French level should not
 * move your Spanish one.
 *
 * Lemmatization is data-driven from Wiktionary's `form_of` senses — see
 * lib/server/frenchLemmatizer.ts for why no npm package is involved.
 */
export const FR_CONFIG: LanguageConfig = {
  code: 'fr',
  name: 'French',
  nativeName: 'Français',
  htmlLang: 'fr',
  bcp47: 'fr-FR',
  levels: [
    { level: 1, label: 'A1', badge: 'A1', tier: 'beginner',     desc: 'Absolute beginner · ~500 words · greetings, numbers, everyday objects' },
    { level: 2, label: 'A2', badge: 'A2', tier: 'beginner',     desc: 'Beginner · ~1,500 words · routine exchanges on familiar matters' },
    { level: 3, label: 'B1', badge: 'B1', tier: 'intermediate', desc: 'Intermediate · ~3,000 words · travel, work, opinions and plans' },
    { level: 4, label: 'B2', badge: 'B2', tier: 'intermediate', desc: 'Upper-intermediate · ~5,000 words · abstract topics with fluency' },
    { level: 5, label: 'C1', badge: 'C1', tier: 'advanced',     desc: 'Advanced · ~8,000 words · implicit meaning, journalism, literature' },
    { level: 6, label: 'C2', badge: 'C2', tier: 'advanced',     desc: 'Mastery · ~12,000 words · near-native precision and nuance' },
  ],
  defaultLevel: 2,
  deckKey: 'fr',
  levelPrefKey: 'frLevel',
  aiProvidesReadings: false,
  hasReadings: false,
  usesBaseForms: true,
  segmentation: 'server',
  scriptIsUnspaced: false,
  wordCharRe: /[a-zA-ZàâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ]/,
  levelSectionLabel: 'CEFR level',
  levelShape: FR_LEVEL_SHAPE,
  glyph: 'é',
  countUnit: 'words',
  dictName: 'Wiktionary',
  sampleWords: ['étudier', 'travail', 'ami'],
  wordFieldLabel: 'Word',
  wordFieldPlaceholder: 'ville',
  // French is written in the same alphabet it is read in — no reading layer.
  readingLabel: '',
  readingHelp: '',
  readingHint: '',
  shortSentenceLimit: 'under 12 words',
  answerScriptNote: 'The answer MUST be written in French.',
};

export const LANGUAGE_CONFIGS: Record<LanguageCode, LanguageConfig> = {
  zh: ZH_CONFIG,
  ja: JA_CONFIG,
  es: ES_CONFIG,
  fr: FR_CONFIG,
};

/** Every supported language, in the order the Header's picker lists them. */
export const SUPPORTED_LANGUAGES: LanguageConfig[] = [ZH_CONFIG, JA_CONFIG, ES_CONFIG, FR_CONFIG];

export function getLanguageConfig(lang: LanguageCode | undefined): LanguageConfig {
  return LANGUAGE_CONFIGS[lang ?? 'zh'] ?? ZH_CONFIG;
}

/** Narrow an untrusted value (request body, stored pref) to a supported language code. */
export function toLanguageCode(value: unknown): LanguageCode {
  return typeof value === 'string' && value in LANGUAGE_CONFIGS ? value as LanguageCode : 'zh';
}

/** The descriptor for one level, or undefined if the language has no such level. */
export function levelDescriptor(lang: LanguageCode | undefined, level: number): LevelDescriptor | undefined {
  return getLanguageConfig(lang).levels.find(l => l.level === level);
}

/** Display label for a level — "HSK 3" | "JLPT N3" | "B1". */
export function levelLabel(lang: LanguageCode | undefined, level: number): string {
  return levelDescriptor(lang, level)?.label ?? String(level);
}

/** Difficulty tier for a level, used to pitch AI generation prompts. */
export function difficultyTier(lang: LanguageCode | undefined, level: number): DifficultyTier {
  return levelDescriptor(lang, level)?.tier ?? 'intermediate';
}

/** Levels ordered easiest → hardest, as level numbers. */
export function levelNumbers(lang: LanguageCode | undefined): number[] {
  return getLanguageConfig(lang).levels.map(l => l.level);
}

/** Read the user's proficiency level for a language from prefs, falling back to its default. */
export function levelFor(
  lang: LanguageCode | undefined,
  prefs: { hskLevel?: number; jlptLevel?: number; cefrLevel?: number; frLevel?: number },
): number {
  const cfg = getLanguageConfig(lang);
  return prefs[cfg.levelPrefKey] ?? cfg.defaultLevel;
}
