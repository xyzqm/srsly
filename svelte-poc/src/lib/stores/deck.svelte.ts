import type { DeckWord, LanguageCode } from '../types';
import { storage } from '../storage';
import { gradeWord, getSrsSettings, newCard, reviveCard, type FsrsGrade } from '../srs';

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
    // Revive Card date fields (and migrate any legacy on-disk shape); backfill missing ids.
    const migrated = d.map((w) => {
      const revived = reviveCard(w);
      return revived.id ? revived : { ...revived, id: genId() };
    });
    this.deck = migrated;
    this.loaded = true;
    // Persist so the (possibly migrated) shape is written back once.
    await storage.saveVocabDeck(lang, migrated);
  }

  private async commit(next: DeckWord[]) {
    this.deck = next;
    await storage.saveVocabDeck(this.lang, next);
  }

  /** Add one word; merges instead of duplicating when (char + meaning) already exists.
   *  Accepts identity fields (h/p/m) plus optional Card overrides (e.g. `due`); everything
   *  else is initialized to a fresh ts-fsrs card via newCard(). */
  async addWord(fields: Partial<DeckWord> & { h: string; p: string; m: string }) {
    const cur = this.deck;
    const existing = cur.findIndex((d) => identity(d) === identity(fields));
    if (existing !== -1) return; // already present — nothing to do in the PoC
    const word = newCard({ id: genId(), ...fields });
    await this.commit([word, ...cur]); // prepend so newest appears first
  }

  async removeWord(id: string) {
    await this.commit(this.deck.filter((d) => d.id !== id));
  }

  /** Grade every reading of a character (review). grade: 1=Again…4=Easy. Scheduling is
   *  delegated to ts-fsrs via the srs.ts adapter. */
  async updateWordReview(hanzi: string, grade: number) {
    const settings = getSrsSettings();
    let touched = false;
    const next = this.deck.map((d) => {
      if (d.h !== hanzi) return d;
      touched = true;
      return gradeWord(d, grade as FsrsGrade, settings);
    });
    if (touched) await this.commit(next);
  }

  /** Replace the whole deck (used by the dev seeding helpers). */
  async setDeck(words: DeckWord[]) {
    await this.commit(words.map((w) => (w.id ? w : { ...w, id: genId() })));
  }

  /** Clear the deck (dev helper). */
  async clear() {
    await this.commit([]);
  }
}

let store: DeckStore | null = null;
export function getDeckStore(): DeckStore {
  if (!store) store = new DeckStore();
  return store;
}
