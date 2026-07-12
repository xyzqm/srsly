import type { DailyContent, DailyPassage, DeckWord, LanguageCode } from '../types';
import { storage } from '../storage';
import { preloadDict } from '../data/lookup';
import { buildTokens, type RawTok } from '../tokens';
import { groupReadings } from '../readings';
import { isDueToday, todayStr } from '../deck';

// Rune-based port of hooks/useDailyContent.ts (passage section, Chinese-only).
// Fetches the AI passage from /api/daily-content, normalizes the raw token arrays into
// PassageTokens with pinyin/meaning resolved from CC-CEDICT, and caches per day+level.

type Status = 'idle' | 'loading' | 'ready' | 'no-key' | 'error';

interface RawPassage {
  title: RawTok[];
  sentences: RawTok[][];
  questions?: unknown[];
}

class DailyStore {
  content = $state<DailyContent | null>(null);
  status = $state<Status>('idle');

  private normalize(raw: RawPassage[], deck: DeckWord[], lang: LanguageCode): DailyPassage[] {
    const today = todayStr();
    const dueWords = new Set(deck.filter((w) => isDueToday(w, today)).map((w) => w.h));
    const deckReadings = groupReadings(deck);
    return raw.map((p) => {
      const sentences = p.sentences.map((row) => {
        const tokens = buildTokens(row, dueWords, deckReadings, lang);
        return { tokens, plainText: tokens.map((t) => t.text).join('') };
      });
      const titleTokens = buildTokens(p.title, dueWords, deckReadings, lang);
      const vocabWords = deck.map((w) => w.h).filter((h) =>
        sentences.some((s) => s.tokens.some((t) => t.text === h)),
      );
      return { titleTokens, sentences, vocabWords };
    });
  }

  /** Load today's cached passage, or generate a fresh one if none is cached. */
  async load(hskLevel: number, deck: DeckWord[], lang: LanguageCode = 'zh') {
    this.status = 'loading';
    await preloadDict(lang);
    const cached = await storage.getDailyContent(lang, hskLevel);
    if (cached && cached.passages.length > 0) {
      this.content = cached;
      this.status = 'ready';
      return;
    }
    await this.generate(hskLevel, deck, lang, 0);
  }

  /** Generate a passage around the due words (or general vocab when none are due). */
  async generate(hskLevel: number, deck: DeckWord[], lang: LanguageCode, themeOffset: number) {
    this.status = 'loading';
    const today = todayStr();
    const dueWords = deck.filter((w) => isDueToday(w, today));
    const words = dueWords.map((w) => ({ h: w.h, p: w.p, m: w.m }));
    try {
      const res = await fetch('/api/daily-content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ words, hskLevel, themeOffset, language: lang }),
      });
      if (res.status === 503) { this.status = 'no-key'; return; }
      if (!res.ok) { this.status = 'error'; return; }
      const body = await res.json();
      const passages = this.normalize(body.data.passages as RawPassage[], deck, lang);
      const content: DailyContent = {
        date: today,
        language: lang,
        hskLevel,
        passages,
        fillItems: [],
        conversation: [],
        sections: { passage: true },
      };
      this.content = content;
      this.status = 'ready';
      await storage.saveDailyContent(content);
    } catch (err) {
      console.error('[daily] generate failed', err);
      this.status = 'error';
    }
  }
}

let store: DailyStore | null = null;
export function getDailyStore(): DailyStore {
  if (!store) store = new DailyStore();
  return store;
}
