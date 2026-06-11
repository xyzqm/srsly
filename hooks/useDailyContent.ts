'use client';
import { useState, useEffect, useCallback } from 'react';
import type { PassageToken, Sentence, FillItem, ConvoTurn, Question, MCOption, DailyContent, DeckWord } from '@/lib/types';
import { storage } from '@/lib/storage';
import { getPassageData } from '@/lib/data/allPassages';
import { lookupWord } from '@/lib/data/dict';

// ─── Raw token shapes returned by the API ───────────────────────────────────

type RawTok = [string] | [string, string] | [string, string, string];

/**
 * Characters that should always be non-interactive, even when the AI
 * accidentally attaches a "pinyin" field to them.
 */
const PUNCT_CHARS = new Set([
  '。','！','？','，','、','—','…','·','「','」','『','』',
  '“','”','‘','’','（','）','【','】','《','》','〈','〉',
  '：','；',',','.',';',':','!','?','(',')','"',"'",'[',']','{','}',
  '–','○','●','□','■','◇','◆','△','▲','▽','▼','★','☆','•','‥',
  '～','~','／','\\','|','`','^',
]);

function isPunct(text: string): boolean {
  if (PUNCT_CHARS.has(text)) return true;
  // Single char that is not a CJK character or Latin letter → treat as punct
  if (text.length === 1 && !/[一-鿿㐀-䶿豈-﫿＀-￯぀-ゟ゠-ヿ]/.test(text) && !/[a-zA-Z0-9]/.test(text)) return true;
  return false;
}

/**
 * Convert a raw API token to a PassageToken.
 * @param deckMeanings  map of hanzi → meaning from the user's deck (fallback for due-words)
 */
function rawToToken(arr: RawTok, dueWords: Set<string>, deckMeanings: Map<string, string>): PassageToken {
  const [text, pinyin, meaning] = arr as [string, string?, string?];
  // No pinyin OR text is punctuation/symbol → non-interactive
  if (!pinyin || isPunct(text)) return { text, type: 'punct' };
  // Resolve meaning: AI-provided → deck → local dictionary (covers words the AI omits)
  const dictEntry = lookupWord(text, pinyin, '');
  const resolvedMeaning = meaning || deckMeanings.get(text) || dictEntry.meaning || '';
  if (dueWords.has(text) || resolvedMeaning) {
    return { text, pinyin, meaning: resolvedMeaning, type: 'vocab' };
  }
  return { text, pinyin };
}

function buildSentences(rawRows: RawTok[][], dueWords: Set<string>, deckMeanings: Map<string, string>): Sentence[] {
  return rawRows.map(row => {
    const tokens = row.map(r => rawToToken(r, dueWords, deckMeanings));
    return { tokens, plainText: tokens.map(t => t.text).join('') };
  });
}

function buildFillItems(rawFills: unknown[], dueWords: Set<string>, deckMeanings: Map<string, string>): FillItem[] {
  return (rawFills as {
    before: RawTok[];
    answer: [string, string];
    after: RawTok[];
    distractors: [string, string][];
  }[]).map(f => {
    const options: FillItem['options'] = [
      [f.answer[0], f.answer[1], true],
      ...f.distractors.map(([h, p]) => [h, p, false] as [string, string, boolean]),
    ];
    // Fisher-Yates shuffle
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return {
      before: f.before.map(r => rawToToken(r, dueWords, deckMeanings)),
      answer: f.answer,
      after: f.after.map(r => rawToToken(r, dueWords, deckMeanings)),
      options,
    };
  });
}

function buildConvo(rawTurns: unknown[], dueWords: Set<string>, deckMeanings: Map<string, string>): ConvoTurn[] {
  return (rawTurns as {
    key: string[];
    tutor: RawTok[];
    suggestions: RawTok[][];
  }[]).map(t => ({
    key: t.key,
    tokens: t.tutor.map(r => rawToToken(r, dueWords, deckMeanings)),
    suggestions: t.suggestions.map(sug => sug.map(r => rawToToken(r, dueWords, deckMeanings))),
  }));
}

function buildTitleTokens(rawTitle: RawTok[], dueWords: Set<string>, deckMeanings: Map<string, string>): PassageToken[] {
  return rawTitle.map(r => rawToToken(r, dueWords, deckMeanings));
}

function buildQuestions(rawQuestions: unknown[], dueWords: Set<string>, deckMeanings: Map<string, string>): Question[] {
  return (rawQuestions as {
    q: RawTok[];
    model: string;
    key: string[];
    options: { tokens: RawTok[]; correct: boolean }[];
  }[]).map(q => ({
    q: q.q.map(r => rawToToken(r, dueWords, deckMeanings)),
    model: q.model,
    key: q.key,
    options: q.options.map(opt => ({
      tokens: opt.tokens.map(r => rawToToken(r, dueWords, deckMeanings)),
      correct: opt.correct,
    } as MCOption)),
  }));
}

/**
 * Retroactively fix cached content that was parsed before the punct-detection
 * logic existed. Any token whose text is punctuation but still has a pinyin
 * field gets cleaned up so it renders as non-interactive.
 */
function sanitizeCachedContent(content: DailyContent): void {
  function fixToken(t: PassageToken) {
    if (t.pinyin && isPunct(t.text)) {
      (t as unknown as Record<string, unknown>).pinyin = undefined;
      t.type = 'punct';
    }
  }
  content.titleTokens.forEach(fixToken);
  content.sentences.forEach(s => s.tokens.forEach(fixToken));
  content.fillItems.forEach(fi => {
    fi.before.forEach(fixToken);
    fi.after.forEach(fixToken);
  });
  content.conversation.forEach(turn => {
    turn.tokens.forEach(fixToken);
    turn.suggestions.forEach(sug => sug.forEach(fixToken));
  });
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export type DailyContentStatus = 'idle' | 'loading' | 'ready' | 'error' | 'no-key' | 'no-words';

export interface UseDailyContentResult {
  dailyContent: DailyContent | null;
  status: DailyContentStatus;
  errorMsg: string;
  regenerate: () => void;
}

/**
 * Loads (or generates) today's AI-driven practice content.
 * Falls back to null when: no API key, <2 deck words, or generation fails.
 * @param hskLevel Current HSK level from settings.
 * @param deck     User's vocab deck (needed to pick due words).
 */
export function useDailyContent(hskLevel: number, deck: DeckWord[]): UseDailyContentResult {
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [status, setStatus] = useState<DailyContentStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [trigger, setTrigger] = useState(0); // bump to force re-fetch

  const regenerate = useCallback(() => {
    // Clear cached content for today so we re-fetch
    const today = new Date().toISOString().slice(0, 10);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`srsly-daily-${hskLevel}-${today}`);
    }
    setDailyContent(null);
    setTrigger(t => t + 1);
  }, [hskLevel]);

  useEffect(() => {
    if (hskLevel === 0) return; // not loaded yet
    if (deck.length < 2) {
      setStatus('no-words');
      setDailyContent(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setStatus('loading');

      // 1. Check cache
      const cached = await storage.getDailyContent(hskLevel);
      if (cached && !cancelled) {
        // Fix any tokens that were cached before the punct-detection fix
        sanitizeCachedContent(cached);
        setDailyContent(cached);
        setStatus('ready');
        return;
      }

      // 2. Choose due words: prioritise least-reviewed, cap at 8
      const sorted = [...deck].sort((a, b) => (a.reviews ?? 0) - (b.reviews ?? 0));
      const dueWords = sorted.slice(0, 8);

      // 3. Call API
      try {
        const res = await fetch('/api/daily-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            words: dueWords.map(w => ({ h: w.h, p: w.p, m: w.m })),
            hskLevel,
          }),
        });

        if (cancelled) return;

        if (res.status === 503) {
          setStatus('no-key');
          setDailyContent(null);
          return;
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }

        const payload = await res.json();
        const { data, vocabWords } = payload as { data: Record<string, unknown>; vocabWords: string[] };

        const dueSet = new Set(vocabWords);
        // Build a meaning lookup from the user's deck so we can fill gaps the AI leaves
        const deckMeanings = new Map(dueWords.map(w => [w.h, w.m]));
        const passageData = getPassageData(hskLevel);
        const today = new Date().toISOString().slice(0, 10);

        // Parse questions if provided
        const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
        const aiQuestions = rawQuestions.length >= 2
          ? buildQuestions(rawQuestions, dueSet, deckMeanings)
          : undefined;

        const content: DailyContent = {
          date: today,
          hskLevel,
          titleTokens: buildTitleTokens(data.title as RawTok[], dueSet, deckMeanings),
          sentences: buildSentences(data.sentences as RawTok[][], dueSet, deckMeanings),
          vocabWords,
          questions: aiQuestions,
          fillItems: buildFillItems(data.fill as unknown[], dueSet, deckMeanings),
          conversation: buildConvo(data.convo as unknown[], dueSet, deckMeanings),
        };

        // Validate minimums — fall back gracefully if Claude produced garbage
        if (
          content.sentences.length < 2 ||
          content.fillItems.length < 1 ||
          content.conversation.length < 2
        ) {
          // Supplement with static data if generation was too short
          if (content.fillItems.length < 1) content.fillItems = passageData.fillItems;
          if (content.conversation.length < 2) content.conversation = passageData.conversation;
        }

        if (cancelled) return;
        await storage.saveDailyContent(content);
        setDailyContent(content);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[useDailyContent]', err);
        setErrorMsg(String(err));
        setStatus('error');
        setDailyContent(null);
      }
    }

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hskLevel, deck.length >= 2, trigger]); // only re-run when crossing the 2-word threshold

  return { dailyContent, status, errorMsg, regenerate };
}
