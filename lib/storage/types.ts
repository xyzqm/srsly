import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent, LanguageCode, ClozeOccurrenceMap, ShelfEntry } from '@/lib/types';
import type { DayActivity } from '@/lib/activityLog';
import type { DayCounts } from '@/lib/reviewCounts';

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

  // The passage shelf: finished passages, kept after the daily cache is pruned. Per
  // language, newest first. See lib/shelf.ts.
  getShelf(lang: LanguageCode): Promise<ShelfEntry[]>;
  saveShelf(lang: LanguageCode, entries: ShelfEntry[]): Promise<void>;

  // Per-passage cloze blank progress. contentKey = "${date}|${language}|${level}".
  getPassageState(contentKey: string, passageIdx: number): Promise<ClozeOccurrenceMap | null>;
  savePassageState(contentKey: string, passageIdx: number, state: ClozeOccurrenceMap): Promise<void>;

  /**
   * The review heatmap's per-day record. Synced because it is the one history the app keeps
   * that nothing else can reconstruct — see lib/activityLog.ts on why `lastReview` cannot
   * stand in for it. Split across two devices it is wrong on both.
   */
  getActivityLog(): Promise<DayActivity[]>;
  saveActivityLog(log: DayActivity[]): Promise<void>;
  /** Today's new/review tallies, per device. Synced so the daily budget is one budget and
   *  not one per device — see lib/reviewCounts.ts. */
  getReviewCounts(): Promise<DayCounts>;
  saveReviewCounts(day: DayCounts): Promise<void>;

  /**
   * Finished lesson ids. Synced, unlike `srsly-achievements-seen` and
   * `srsly-curriculum-pruned` which stay device-local: the grammar track is NUMBERED and
   * `nextGrammarLesson` marks where you left off, so an unsynced list actively sends a
   * learner back to a lesson they finished.
   */
  getLessonsDone(): Promise<string[]>;
  saveLessonsDone(ids: string[]): Promise<void>;
}
