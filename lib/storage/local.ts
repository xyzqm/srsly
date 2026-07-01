import type { DataService } from './types';
import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent, LanguageCode, ClozeOccurrenceMap } from '@/lib/types';

const KEYS = {
  vocabLegacy: 'srsly-vocab-deck', // pre-multilanguage; migrated to srsly-vocab-deck-zh on first read
  srs: 'srsly-srs-state',
  prefs: 'srsly-prefs',
  claimed: 'srsly-claimed-words',
} as const;

/** Per-language vocab deck key, e.g. 'zh' → 'srsly-vocab-deck-zh'. */
function vocabKey(lang: LanguageCode): string {
  return `srsly-vocab-deck-${lang}`;
}

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

/** Cache key for daily content, scoped by language + proficiency level + study deck + date. */
function dailyKey(lang: LanguageCode, level: number, deck: string | undefined, date: string): string {
  const d = deck && deck.trim() ? deck.trim() : 'all';
  return `srsly-daily-${lang}-${level}-${d}-${date}`;
}

/** Storage key for per-passage cloze state. contentKey = "${date}|${level}|${deck}". */
function clozeStateKey(contentKey: string, passageIdx: number): string {
  return `srsly-cloze|${contentKey}|${passageIdx}`;
}

export class LocalStorage implements DataService {
  async getVocabDeck(lang: LanguageCode): Promise<DeckWord[]> {
    const key = vocabKey(lang);
    // One-time migration: the original single-deck key holds Chinese vocab. Move it under
    // the language-namespaced 'zh' key the first time it's requested, then drop the legacy key.
    if (lang === 'zh' && typeof window !== 'undefined' && localStorage.getItem(key) === null) {
      const legacy = localStorage.getItem(KEYS.vocabLegacy);
      if (legacy !== null) {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(KEYS.vocabLegacy);
      }
    }
    return get<DeckWord[]>(key, []);
  }
  async saveVocabDeck(lang: LanguageCode, deck: DeckWord[]): Promise<void> {
    set(vocabKey(lang), deck);
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

  async getDailyContent(lang: LanguageCode, level: number, deck?: string): Promise<DailyContent | null> {
    const today = new Date().toISOString().slice(0, 10);
    return get<DailyContent | null>(dailyKey(lang, level, deck, today), null);
  }
  async saveDailyContent(content: DailyContent): Promise<void> {
    set(dailyKey(content.language ?? 'zh', content.hskLevel, content.deck, content.date), content);
    // Prune stale per-day localStorage entries: daily content, passage index, passage-finished
    // flags, and cloze state. All keyed with the date so we can compare against today.
    const today = content.date;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('srsly-daily-') && !k.endsWith(today)) { localStorage.removeItem(k); continue; }
      // srsly-read-pidx|{date}|..., srsly-done|{date}|..., srsly-cloze|{date}|... — date is 2nd segment
      if (k.startsWith('srsly-read-pidx|') || k.startsWith('srsly-done|') || k.startsWith('srsly-cloze|')) {
        const date = k.split('|')[1];
        if (date && date !== today) localStorage.removeItem(k);
      }
    }
  }

  async getPassageState(contentKey: string, passageIdx: number): Promise<ClozeOccurrenceMap | null> {
    return get<ClozeOccurrenceMap | null>(clozeStateKey(contentKey, passageIdx), null);
  }

  async savePassageState(contentKey: string, passageIdx: number, state: ClozeOccurrenceMap): Promise<void> {
    set(clozeStateKey(contentKey, passageIdx), state);
  }
}
