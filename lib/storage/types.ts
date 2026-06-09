import type { DeckWord, SRSState, UserPrefs, ClaimedWords } from '@/lib/types';

export interface DataService {
  getVocabDeck(): Promise<DeckWord[]>;
  saveVocabDeck(deck: DeckWord[]): Promise<void>;

  getSRSState(): Promise<SRSState>;
  saveSRSState(state: SRSState): Promise<void>;

  getPrefs(): Promise<UserPrefs>;
  savePrefs(prefs: UserPrefs): Promise<void>;

  getClaimedWords(): Promise<ClaimedWords>;
  saveClaimedWords(claimed: ClaimedWords): Promise<void>;
}
