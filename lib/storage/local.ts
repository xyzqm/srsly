import type { DataService } from './types';
import type { DeckWord, SRSState, UserPrefs, ClaimedWords } from '@/lib/types';
import { DEFAULT_DECK } from '@/lib/data/deck';

const KEYS = {
  vocab: 'srsly-vocab-deck',
  srs: 'srsly-srs-state',
  prefs: 'srsly-prefs',
  claimed: 'srsly-claimed-words',
} as const;

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

export class LocalStorage implements DataService {
  async getVocabDeck(): Promise<DeckWord[]> {
    return get<DeckWord[]>(KEYS.vocab, DEFAULT_DECK.map(d => ({ ...d })));
  }
  async saveVocabDeck(deck: DeckWord[]): Promise<void> {
    set(KEYS.vocab, deck);
  }

  async getSRSState(): Promise<SRSState> {
    return get<SRSState>(KEYS.srs, {
      streak: 14,
      lastVisit: '',
      todayScore: -1,
      todayScoreDate: '',
    });
  }
  async saveSRSState(state: SRSState): Promise<void> {
    set(KEYS.srs, state);
  }

  async getPrefs(): Promise<UserPrefs> {
    return get<UserPrefs>(KEYS.prefs, { theme: 'paper', font: 'editorial-warm' });
  }
  async savePrefs(prefs: UserPrefs): Promise<void> {
    set(KEYS.prefs, prefs);
  }

  async getClaimedWords(): Promise<ClaimedWords> {
    return get<ClaimedWords>(KEYS.claimed, { vocab: [], tomorrow: [] });
  }
  async saveClaimedWords(claimed: ClaimedWords): Promise<void> {
    set(KEYS.claimed, claimed);
  }
}
