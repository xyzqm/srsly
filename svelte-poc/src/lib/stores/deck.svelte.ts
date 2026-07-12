import type { DeckWord, LanguageCode } from '../types';
import { storage } from '../storage';
import { dateInDays, todayStr } from '../deck';
import { fsrsSchedule, getSrsSettings, type FsrsGrade } from '../fsrs';

// Rune-based port of hooks/useVocabDeck.ts (core surface the PoC exercises).
// A class holding $state deck; the same instance is shared app-wide via getDeckStore().

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** Dedup identity: same character + same meaning = the same card. */
function identity(w: { h: string; m: string }): string {
  return w.h + '' + w.m.trim();
}

class DeckStore {
  deck = $state<DeckWord[]>([]);
  loaded = $state(false);
  private lang: LanguageCode = 'zh';

  async load(lang: LanguageCode = 'zh') {
    this.lang = lang;
    this.loaded = false;
    const d = await storage.getVocabDeck(lang);
    let changed = false;
    const migrated = d.map((w) => (w.id ? w : (changed = true, { ...w, id: genId() })));
    this.deck = migrated;
    this.loaded = true;
    if (changed) await storage.saveVocabDeck(lang, migrated);
  }

  private async commit(next: DeckWord[]) {
    this.deck = next;
    await storage.saveVocabDeck(this.lang, next);
  }

  /** Add one word; merges instead of duplicating when (char + meaning) already exists. */
  async addWord(word: DeckWord) {
    const cur = this.deck;
    const existing = cur.findIndex((d) => identity(d) === identity(word));
    if (existing !== -1) return; // already present — nothing to do in the PoC
    const withId = word.id ? word : { ...word, id: genId() };
    await this.commit([withId, ...cur]); // prepend so newest appears first
  }

  async removeWord(id: string) {
    await this.commit(this.deck.filter((d) => d.id !== id));
  }

  /** Grade every reading of a character (passage-level review). grade: 1=Again…4=Easy. */
  async updateWordReview(hanzi: string, grade: number, opts?: { minDaysOut?: number }) {
    const settings = getSrsSettings();
    const minDate = opts?.minDaysOut ? dateInDays(opts.minDaysOut) : undefined;
    const today = todayStr();
    let touched = false;
    const next = this.deck.map((d) => {
      if (d.h !== hanzi) return d;
      touched = true;
      const patch = fsrsSchedule(d, grade as FsrsGrade, settings, { fuzz: true });
      if (minDate && patch.dueAt !== undefined && patch.dueAt <= today) {
        return { ...d, ...patch, dueAt: minDate, dueAtMs: undefined, phase: 'review' as const };
      }
      return { ...d, ...patch };
    });
    if (touched) await this.commit(next);
  }
}

let store: DeckStore | null = null;
export function getDeckStore(): DeckStore {
  if (!store) store = new DeckStore();
  return store;
}
