import type { LanguageCode } from './types';

/**
 * Language-aware UI copy that isn't part of `LanguageConfig`.
 *
 * The practice tabs mark their empty/done/loading states with a large decorative word in
 * the language being studied. Those were hardcoded Chinese characters (空 好 完 填), so a
 * French or Spanish learner got Chinese bleeding into the UI. `LanguageConfig` is already
 * carrying ~25 fields, so this lives separately rather than bloating it further.
 *
 * Keep the values SHORT — they render large. `stateGlyphSize` steps the font down for the
 * alphabetic languages, where a word is many characters wide rather than one glyph.
 */
export interface UiStrings {
  /** Nothing in the deck at all. */
  empty: string;
  /** Deck has words, but none are due. */
  caughtUp: string;
  /** Session finished. */
  complete: string;
  /** Content is being generated. */
  generating: string;
  /** Placeholder for the Conversation reply box. */
  replyPlaceholder: string;
}

const STRINGS: Record<LanguageCode, UiStrings> = {
  zh: { empty: '空',    caughtUp: '好',    complete: '完',  generating: '填',
        replyPlaceholder: 'Type your reply in Chinese…' },
  ja: { empty: '空',    caughtUp: '良',    complete: '完',  generating: '書',
        replyPlaceholder: 'Type your reply in Japanese…' },
  ko: { empty: '없음',  caughtUp: '좋아',  complete: '완료', generating: '작성',
        replyPlaceholder: 'Type your reply in Korean…' },
  es: { empty: 'Vacío', caughtUp: '¡Bien!', complete: 'Fin', generating: 'Creando',
        replyPlaceholder: 'Type your reply in Spanish…' },
  fr: { empty: 'Vide',  caughtUp: 'Bravo', complete: 'Fin', generating: 'Création',
        replyPlaceholder: 'Type your reply in French…' },
};

export function uiStrings(lang: LanguageCode | undefined): UiStrings {
  return STRINGS[lang ?? 'zh'] ?? STRINGS.zh;
}

/**
 * Font size for the large state marker. One CJK glyph carries at 52px; a word like
 * "Création" needs to come down or it overflows the card.
 */
export function stateGlyphSize(text: string): number {
  if (text.length <= 1) return 52;
  if (text.length <= 2) return 44;
  if (text.length <= 5) return 34;
  return 26;
}
