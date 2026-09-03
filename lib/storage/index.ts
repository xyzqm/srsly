import type { DataService } from './types';
import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent, LanguageCode, ClozeOccurrenceMap, ShelfEntry } from '@/lib/types';
import { LocalStorage } from './local';
import type { DayActivity } from '@/lib/activityLog';
import type { DayCounts } from '@/lib/reviewCounts';

/**
 * The app imports this singleton and never the concrete backend. By default it forwards
 * to LocalStorage (guest / offline); after a real sign-in, AuthProvider calls
 * `setBackend(new SupabaseStorage(...))` so every existing consumer transparently reads
 * and writes the cloud — no call-site changes (they already await every method).
 */
class StorageFacade implements DataService {
  private impl: DataService = new LocalStorage();

  setBackend(impl: DataService) { this.dispose(); this.impl = impl; }
  resetToLocal() { this.dispose(); this.impl = new LocalStorage(); }

  /** Let a backend release anything global before it is replaced — SupabaseStorage keeps an
   *  `online` listener for its retry queue, and a swapped-out instance holding one would keep
   *  flushing into a row the signed-out user no longer owns. */
  private dispose() { (this.impl as { dispose?: () => void }).dispose?.(); }

  /**
   * Retry anything that failed to reach the cloud.
   *
   * Called alongside `invalidate()` on focus, and BEFORE the re-read — the ordering matters.
   * A read that mirrors the cloud down while a write is still queued is the exact deletion
   * the queue exists to prevent, and the read guards in SupabaseStorage are the belt to this
   * pair of braces. LocalStorage has nothing to flush.
   */
  flush() { return (this.impl as { flush?: () => Promise<void> }).flush?.() ?? Promise.resolve(); }

  /**
   * Drop any cached remote state so the next read goes to the network.
   *
   * Called when a tab regains focus, which is the moment another device's changes are most
   * likely to be waiting — you put the phone down and pick up the laptop. LocalStorage has
   * nothing to invalidate, so this is a no-op there; only SupabaseStorage implements it.
   */
  invalidate() { (this.impl as { invalidate?: () => void }).invalidate?.(); }

  getVocabDeck(lang: LanguageCode) { return this.impl.getVocabDeck(lang); }
  saveVocabDeck(lang: LanguageCode, deck: DeckWord[]) { return this.impl.saveVocabDeck(lang, deck); }
  getSRSState() { return this.impl.getSRSState(); }
  saveSRSState(state: SRSState) { return this.impl.saveSRSState(state); }
  getPrefs() { return this.impl.getPrefs(); }
  savePrefs(prefs: UserPrefs) { return this.impl.savePrefs(prefs); }
  getClaimedWords() { return this.impl.getClaimedWords(); }
  saveClaimedWords(claimed: ClaimedWords) { return this.impl.saveClaimedWords(claimed); }
  getDailyContent(lang: LanguageCode, level: number) { return this.impl.getDailyContent(lang, level); }
  saveDailyContent(content: DailyContent) { return this.impl.saveDailyContent(content); }
  getShelf(lang: LanguageCode) { return this.impl.getShelf(lang); }
  saveShelf(lang: LanguageCode, entries: ShelfEntry[]) { return this.impl.saveShelf(lang, entries); }
  getPassageState(contentKey: string, passageIdx: number) { return this.impl.getPassageState(contentKey, passageIdx); }
  savePassageState(contentKey: string, passageIdx: number, state: ClozeOccurrenceMap) { return this.impl.savePassageState(contentKey, passageIdx, state); }
  getReviewCounts() { return this.impl.getReviewCounts(); }
  saveReviewCounts(day: DayCounts) { return this.impl.saveReviewCounts(day); }
  getActivityLog() { return this.impl.getActivityLog(); }
  saveActivityLog(log: DayActivity[]) { return this.impl.saveActivityLog(log); }
  getLessonsDone() { return this.impl.getLessonsDone(); }
  saveLessonsDone(ids: string[]) { return this.impl.saveLessonsDone(ids); }
}

export const storage = new StorageFacade();
