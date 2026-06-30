import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent, LanguageCode } from '@/lib/types';

export interface DataService {
  // Vocab decks are per-language (a Chinese deck and a Japanese deck are independent).
  getVocabDeck(lang: LanguageCode): Promise<DeckWord[]>;
  saveVocabDeck(lang: LanguageCode, deck: DeckWord[]): Promise<void>;

  getSRSState(): Promise<SRSState>;
  saveSRSState(state: SRSState): Promise<void>;

  getPrefs(): Promise<UserPrefs>;
  savePrefs(prefs: UserPrefs): Promise<void>;

  getClaimedWords(): Promise<ClaimedWords>;
  saveClaimedWords(claimed: ClaimedWords): Promise<void>;

  // Daily content is cached per language + level + deck + day.
  getDailyContent(lang: LanguageCode, level: number, deck?: string): Promise<DailyContent | null>;
  saveDailyContent(content: DailyContent): Promise<void>;
}
