import type { DataService } from './types';
import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent } from '@/lib/types';
import { LocalStorage } from './local';

/**
 * The app imports this singleton and never the concrete backend. By default it forwards
 * to LocalStorage (guest / offline); after a real sign-in, AuthProvider calls
 * `setBackend(new SupabaseStorage(...))` so every existing consumer transparently reads
 * and writes the cloud — no call-site changes (they already await every method).
 */
class StorageFacade implements DataService {
  private impl: DataService = new LocalStorage();

  setBackend(impl: DataService) { this.impl = impl; }
  resetToLocal() { this.impl = new LocalStorage(); }

  getVocabDeck() { return this.impl.getVocabDeck(); }
  saveVocabDeck(deck: DeckWord[]) { return this.impl.saveVocabDeck(deck); }
  getSRSState() { return this.impl.getSRSState(); }
  saveSRSState(state: SRSState) { return this.impl.saveSRSState(state); }
  getPrefs() { return this.impl.getPrefs(); }
  savePrefs(prefs: UserPrefs) { return this.impl.savePrefs(prefs); }
  getClaimedWords() { return this.impl.getClaimedWords(); }
  saveClaimedWords(claimed: ClaimedWords) { return this.impl.saveClaimedWords(claimed); }
  getDailyContent(hskLevel: number, deck?: string) { return this.impl.getDailyContent(hskLevel, deck); }
  saveDailyContent(content: DailyContent) { return this.impl.saveDailyContent(content); }
}

export const storage = new StorageFacade();
