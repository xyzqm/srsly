import type { DataService } from './types';
import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent } from '@/lib/types';

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

/** Cache key for daily content, scoped by HSK level + study deck + date. */
function dailyKey(hskLevel: number, deck: string | undefined, date: string): string {
  const d = deck && deck.trim() ? deck.trim() : 'all';
  return `srsly-daily-${hskLevel}-${d}-${date}`;
}

export class LocalStorage implements DataService {
  async getVocabDeck(): Promise<DeckWord[]> {
    return get<DeckWord[]>(KEYS.vocab, []);
  }
  async saveVocabDeck(deck: DeckWord[]): Promise<void> {
    set(KEYS.vocab, deck);
  }

  async getSRSState(): Promise<SRSState> {
    return get<SRSState>(KEYS.srs, {
      streak: 0,
      lastVisit: '',
      todayScore: -1,
      todayScoreDate: '',
      sessions: 0,
    });
  }
  async saveSRSState(state: SRSState): Promise<void> {
    set(KEYS.srs, state);
  }

  async getPrefs(): Promise<UserPrefs> {
    return get<UserPrefs>(KEYS.prefs, { theme: 'paper', font: 'editorial-warm', hskLevel: 3 });
  }
  async savePrefs(prefs: UserPrefs): Promise<void> {
    set(KEYS.prefs, prefs);
  }

  async getClaimedWords(): Promise<ClaimedWords> {
    return get<ClaimedWords>(KEYS.claimed, { vocab: [] });
  }
  async saveClaimedWords(claimed: ClaimedWords): Promise<void> {
    set(KEYS.claimed, claimed);
  }

  async getDailyContent(hskLevel: number, deck?: string): Promise<DailyContent | null> {
    const today = new Date().toISOString().slice(0, 10);
    return get<DailyContent | null>(dailyKey(hskLevel, deck, today), null);
  }
  async saveDailyContent(content: DailyContent): Promise<void> {
    set(dailyKey(content.hskLevel, content.deck, content.date), content);
    // Prune any cached daily content from previous days (across all level/deck scopes).
    const today = content.date;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('srsly-daily-') && !k.endsWith(today)) localStorage.removeItem(k);
    }
  }
}
