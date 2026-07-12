import type { DeckWord, UserPrefs, DailyContent, LanguageCode, ClozeOccurrenceMap } from './types';
import { todayStr } from './deck';

// Plain (non-React) localStorage layer — a direct port of the React app's
// lib/storage/local.ts, minus the SRS/claims surfaces the PoC doesn't exercise.

const KEYS = {
  prefs: 'srsly-prefs',
} as const;

function vocabKey(lang: LanguageCode): string {
  return `srsly-vocab-deck-${lang}`;
}

function get<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function set(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

/** Cache key for daily content, scoped by language + level + deck + date. */
function dailyKey(lang: LanguageCode, level: number, deck: string | undefined, date: string): string {
  const d = deck && deck.trim() ? deck.trim() : 'all';
  return `srsly-daily-${lang}-${level}-${d}-${date}`;
}

function clozeStateKey(contentKey: string, passageIdx: number): string {
  return `srsly-cloze|${contentKey}|${passageIdx}`;
}

export const storage = {
  async getVocabDeck(lang: LanguageCode): Promise<DeckWord[]> {
    return get<DeckWord[]>(vocabKey(lang), []);
  },
  async saveVocabDeck(lang: LanguageCode, deck: DeckWord[]): Promise<void> {
    set(vocabKey(lang), deck);
  },

  async getPrefs(): Promise<UserPrefs> {
    return get<UserPrefs>(KEYS.prefs, { theme: 'paper', font: 'editorial-warm', hskLevel: 3 });
  },
  async savePrefs(prefs: UserPrefs): Promise<void> {
    set(KEYS.prefs, prefs);
  },

  async getDailyContent(lang: LanguageCode, level: number, deck?: string): Promise<DailyContent | null> {
    return get<DailyContent | null>(dailyKey(lang, level, deck, todayStr()), null);
  },
  async saveDailyContent(content: DailyContent): Promise<void> {
    set(dailyKey(content.language ?? 'zh', content.hskLevel, content.deck, content.date), content);
  },

  async getPassageState(contentKey: string, passageIdx: number): Promise<ClozeOccurrenceMap | null> {
    return get<ClozeOccurrenceMap | null>(clozeStateKey(contentKey, passageIdx), null);
  },
  async savePassageState(contentKey: string, passageIdx: number, state: ClozeOccurrenceMap): Promise<void> {
    set(clozeStateKey(contentKey, passageIdx), state);
  },
};
