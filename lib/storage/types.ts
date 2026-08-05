import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent, LanguageCode, ClozeOccurrenceMap } from '@/lib/types';

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

  // Daily content is cached per language + level + day.
  getDailyContent(lang: LanguageCode, level: number): Promise<DailyContent | null>;
  saveDailyContent(content: DailyContent): Promise<void>;

  // Per-passage cloze blank progress. contentKey = "${date}|${language}|${level}".
  getPassageState(contentKey: string, passageIdx: number): Promise<ClozeOccurrenceMap | null>;
  savePassageState(contentKey: string, passageIdx: number, state: ClozeOccurrenceMap): Promise<void>;
}
