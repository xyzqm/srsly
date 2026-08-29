/**
 * Firebase implementation of DataService.
 *
 * To activate:
 *   1. npm install firebase
 *   2. Fill in firebaseConfig below
 *   3. In lib/storage/index.ts, swap LocalStorage for FirebaseStorage
 *
 * All methods mirror the LocalStorage API exactly — no component changes needed.
 */

// import { initializeApp } from 'firebase/app';
// import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import type { DataService } from './types';
import type { DayActivity } from '@/lib/activityLog';
import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent, LanguageCode, ClozeOccurrenceMap, ShelfEntry } from '@/lib/types';

// const firebaseConfig = {
//   apiKey: '...',
//   authDomain: '...',
//   projectId: '...',
// };
// const app = initializeApp(firebaseConfig);
// const db = getFirestore(app);

export class FirebaseStorage implements DataService {
  // Replace 'user_id' with actual auth uid once auth is wired up
  private uid = 'user_id';

  async getVocabDeck(_lang: LanguageCode): Promise<DeckWord[]> {
    throw new Error('FirebaseStorage not yet configured — see lib/storage/firebase.ts');
  }
  async saveVocabDeck(_lang: LanguageCode, _deck: DeckWord[]): Promise<void> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async getSRSState(): Promise<SRSState> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async saveSRSState(_state: SRSState): Promise<void> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async getPrefs(): Promise<UserPrefs> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async savePrefs(_prefs: UserPrefs): Promise<void> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async getClaimedWords(): Promise<ClaimedWords> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async saveClaimedWords(_claimed: ClaimedWords): Promise<void> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async getDailyContent(_lang: LanguageCode, _level: number): Promise<DailyContent | null> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async saveDailyContent(_content: DailyContent): Promise<void> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async getShelf(_lang: LanguageCode): Promise<ShelfEntry[]> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async saveShelf(_lang: LanguageCode, _entries: ShelfEntry[]): Promise<void> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async getPassageState(_contentKey: string, _passageIdx: number): Promise<ClozeOccurrenceMap | null> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async savePassageState(_contentKey: string, _passageIdx: number, _state: ClozeOccurrenceMap): Promise<void> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async getActivityLog(): Promise<DayActivity[]> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async saveActivityLog(_log: DayActivity[]): Promise<void> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async getLessonsDone(): Promise<string[]> {
    throw new Error('FirebaseStorage not yet configured');
  }
  async saveLessonsDone(_ids: string[]): Promise<void> {
    throw new Error('FirebaseStorage not yet configured');
  }
}
