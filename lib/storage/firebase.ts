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
import type { DeckWord, SRSState, UserPrefs, ClaimedWords } from '@/lib/types';

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

  async getVocabDeck(): Promise<DeckWord[]> {
    throw new Error('FirebaseStorage not yet configured — see lib/storage/firebase.ts');
  }
  async saveVocabDeck(_deck: DeckWord[]): Promise<void> {
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
}
