import type { DataService } from './types';
import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent, LanguageCode, ClozeOccurrenceMap, ShelfEntry } from '@/lib/types';
import { contentKeyOf, entriesFrom, mergeShelf } from '@/lib/shelf';
import { todayStr } from '@/lib/deck';
import { getActivityLog, setActivityLog, type DayActivity } from '@/lib/activityLog';
import { loadDone, saveDone } from '@/lib/lessons';

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

/**
 * Cache key for daily content, scoped by language + proficiency level + date.
 *
 * The `v2` is a CACHE BREAK, and the reason is worth keeping. Passages built before your own
 * reading stopped carrying blanks were cached with their `vocabWords` intact, so a starter
 * text opened from cache still rendered blanks — already filled in — long after the code that
 * made them was gone. A cached passage carries no marker saying which rules built it, so the
 * only honest fix is to stop reading the old ones. Bump this again if the passage shape ever
 * changes in a way old entries cannot satisfy.
 */
function dailyKey(lang: LanguageCode, level: number, date: string): string {
  return `srsly-daily-v2-${lang}-${level}-${date}`;
}

/** Storage key for a language's passage shelf. */
function shelfKey(lang: LanguageCode): string {
  return `srsly-shelf-${lang}`;
}

/** Storage key for per-passage cloze state. contentKey = "${date}|${language}|${level}". */
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

  async getDailyContent(lang: LanguageCode, level: number): Promise<DailyContent | null> {
    const today = todayStr();
    return get<DailyContent | null>(dailyKey(lang, level, today), null);
  }
  async getShelf(lang: LanguageCode): Promise<ShelfEntry[]> {
    return get<ShelfEntry[]>(shelfKey(lang), []);
  }
  async saveShelf(lang: LanguageCode, entries: ShelfEntry[]): Promise<void> {
    set(shelfKey(lang), entries);
  }

  async saveDailyContent(content: DailyContent): Promise<void> {
    set(dailyKey(content.language ?? 'zh', content.hskLevel, content.date), content);
    const today = content.date;

    // ── Archive before pruning ────────────────────────────────────────────────
    // Every OUTGOING day is shelved first. This has to happen here rather than only for
    // `content`, because a passage is finished AFTER its content was saved: on the day you
    // read it the `srsly-done|` flag does not exist yet, and by the time the next day's
    // content arrives this loop is about to delete the passage. Archiving the stale entries
    // on their way out is the only point that sees a finished passage and its text together.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('srsly-daily-') || k.endsWith(today)) continue;
      const stale = get<DailyContent | null>(k, null);
      if (stale) this.shelveFinished(stale);
    }
    // Also shelve today's, so a passage finished earlier in the same session appears on the
    // shelf now instead of tomorrow. Entries are keyed by a stable id, so doing both is a
    // no-op on the second pass rather than a duplicate.
    this.shelveFinished(content);

    // ── Prune stale per-day entries ───────────────────────────────────────────
    // Daily content, passage index, passage-finished flags, and cloze state. All keyed with
    // the date so we can compare against today.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('srsly-daily-') && !k.endsWith(today)) { localStorage.removeItem(k); continue; }
      // srsly-read-pidx|{date}|..., srsly-done|{date}|..., srsly-cloze|{date}|... — date is 2nd segment
      if (k.startsWith('srsly-read-pidx|') || k.startsWith('srsly-done|') || k.startsWith('srsly-cloze|') || k.startsWith('srsly-qa|') || k.startsWith('srsly-added-words|') || k.startsWith('srsly-missed-sentences|')) {
        const date = k.split('|')[1];
        if (date && date !== today) localStorage.removeItem(k);
      }
    }
  }

  /**
   * Copy one day's FINISHED passages onto the shelf.
   *
   * Reads the same `srsly-done|` and `srsly-cloze|` keys ReadTab writes, so "finished"
   * means what it means everywhere else. Called repeatedly for the same day — a day's
   * content is saved again as each section generates lazily — which is why shelf entries
   * are keyed by a stable id and merged rather than appended.
   *
   * Failures are swallowed: losing an archive entry must never break saving the content
   * the user is about to read.
   */
  private shelveFinished(content: DailyContent): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const lang = content.language ?? 'zh';
      const ck = contentKeyOf(content);
      const fresh = entriesFrom(
        content,
        idx => localStorage.getItem(`srsly-done|${ck}|${idx}`) !== null,
        idx => get<ClozeOccurrenceMap | null>(clozeStateKey(ck, idx), null),
      );
      if (fresh.length === 0) return;
      set(shelfKey(lang), mergeShelf(get<ShelfEntry[]>(shelfKey(lang), []), fresh));
    } catch { /* quota or parse failure — the passage itself still saved */ }
  }

  async getPassageState(contentKey: string, passageIdx: number): Promise<ClozeOccurrenceMap | null> {
    return get<ClozeOccurrenceMap | null>(clozeStateKey(contentKey, passageIdx), null);
  }

  async savePassageState(contentKey: string, passageIdx: number, state: ClozeOccurrenceMap): Promise<void> {
    set(clozeStateKey(contentKey, passageIdx), state);
  }

  // Both of these already have synchronous owners with their own keys and their own pruning
  // rules, so this delegates rather than reimplementing them over `get`/`set` — two writers
  // to one key is how the two copies start disagreeing.
  async getActivityLog(): Promise<DayActivity[]> { return getActivityLog(); }
  async saveActivityLog(log: DayActivity[]): Promise<void> { setActivityLog(log); }

  async getLessonsDone(): Promise<string[]> { return [...loadDone()]; }
  async saveLessonsDone(ids: string[]): Promise<void> { saveDone(new Set(ids)); }
}
