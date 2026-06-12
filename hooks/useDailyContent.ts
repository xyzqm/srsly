'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { PassageToken, Sentence, FillItem, ConvoTurn, Question, MCOption, DailyContent, DailyPassage, DeckWord } from '@/lib/types';
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
  '\u201c','\u201d','\u2018','\u2019','（','）','【','】','《','》','〈','〉',
  '：','；',',','.',';',':','!','?','(',')','"',"'",'[',']','{','}',
  '–','○','●','□','■','◇','◆','△','▲','▽','▼','★','☆','•','‥',
  '～','~','／','\\','|','`','^',
]);
function isPunct(text: string): boolean {
  if (PUNCT_CHARS.has(text)) return true;
  // Single char that is not CJK or Latin → treat as punct
  if (text.length === 1 && !/[一-鿿㐀-䶿豈-﫿＀-￯぀-ゟ゠-ヿ]/.test(text) && !/[a-zA-Z0-9]/.test(text)) return true;
  return false;
}

function rawToToken(arr: RawTok, dueWords: Set<string>, deckMeanings: Map<string, string>): PassageToken {
  const [text, pinyin, meaning] = arr as [string, string?, string?];
  if (!pinyin || isPunct(text)) return { text, type: 'punct' };
  const dictEntry = lookupWord(text, pinyin, '');
  const resolvedMeaning = meaning || deckMeanings.get(text) || dictEntry.meaning || '';
  if (dueWords.has(text) || resolvedMeaning) {
    return { text, pinyin, meaning: resolvedMeaning, type: 'vocab' };
  }
  return { text, pinyin };
}

function buildSentences(rawRows: RawTok[][], dueWords: Set<string>, deckMeanings: Map<string, string>): Sentence[] {
  return rawRows.map(row => {
    const tokens = row
      .filter(r => r[0] !== '') // drop empty tokens the AI occasionally emits
      .map(r => rawToToken(r, dueWords, deckMeanings));
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
      before: f.before.filter(r => r[0] !== '').map(r => rawToToken(r, dueWords, deckMeanings)),
      answer: f.answer,
      after: f.after.filter(r => r[0] !== '').map(r => rawToToken(r, dueWords, deckMeanings)),
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

/** Build a single DailyPassage from raw API output. */
function buildPassage(
  rawPassage: { title: RawTok[]; sentences: RawTok[][]; questions?: unknown[] },
  vocabWords: string[],
  dueSet: Set<string>,
  deckMeanings: Map<string, string>,
): DailyPassage {
  const rawQs = Array.isArray(rawPassage.questions) ? rawPassage.questions : [];
  const aiQs = rawQs.length >= 1 ? buildQuestions(rawQs, dueSet, deckMeanings) : undefined;
  return {
    titleTokens: buildTitleTokens(rawPassage.title, dueSet, deckMeanings),
    sentences: buildSentences(rawPassage.sentences, dueSet, deckMeanings),
    vocabWords,
    questions: aiQs,
  };
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
  content.passages.forEach(p => {
    p.titleTokens.forEach(fixToken);
    p.sentences.forEach(s => s.tokens.forEach(fixToken));
    p.questions?.forEach(q => {
      q.q.forEach(fixToken);
      q.options.forEach(opt => opt.tokens.forEach(fixToken));
    });
  });
  content.fillItems.forEach(fi => {
    fi.before.forEach(fixToken);
    fi.after.forEach(fixToken);
  });
  content.conversation.forEach(turn => {
    turn.tokens.forEach(fixToken);
    turn.suggestions.forEach(sug => sug.forEach(fixToken));
  });
}

/**
 * Migrate old flat-structure DailyContent (pre-passages refactor) to new format.
 * Returns null if the data is corrupt and should be ignored.
 */
function migrateContent(raw: Record<string, unknown>): DailyContent | null {
  // Already new format
  if (Array.isArray(raw.passages)) return raw as unknown as DailyContent;
  // Old format: titleTokens/sentences at top level
  if (!raw.sentences || !raw.titleTokens) return null;
  return {
    date: raw.date as string,
    hskLevel: raw.hskLevel as number,
    passages: [{
      titleTokens: raw.titleTokens as PassageToken[],
      sentences: raw.sentences as Sentence[],
      vocabWords: (raw.vocabWords as string[]) ?? [],
      questions: raw.questions as Question[] | undefined,
    }],
    fillItems: (raw.fillItems as FillItem[]) ?? [],
    conversation: (raw.conversation as ConvoTurn[]) ?? [],
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/** Words per passage — also the max sent for initial generation (= 1 passage). */
const MAX_WORDS = 5;
/** Minimum words — ensures at least one full passage even if few are due today. */
const MIN_WORDS = 5;

export type DailyContentStatus = 'idle' | 'loading' | 'ready' | 'error' | 'no-key' | 'no-words';

export interface UseDailyContentResult {
  dailyContent: DailyContent | null;
  status: DailyContentStatus;
  errorMsg: string;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
}

/**
 * Loads (or generates) today's AI-driven practice content.
 * Only words with dueAt <= today are sent to the API (SRS scheduling).
 * Falls back to null when: no API key, <2 deck words, or generation fails.
 */
export function useDailyContent(hskLevel: number, deck: DeckWord[]): UseDailyContentResult {
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [status, setStatus] = useState<DailyContentStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [trigger, setTrigger] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Keep a stable ref to the deck so the async load closure always sees current data
  const deckRef = useRef(deck);
  deckRef.current = deck;

  useEffect(() => {
    if (hskLevel === 0) return;
    if (deck.length < 2) {
      setStatus('no-words');
      setDailyContent(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setStatus('loading');

      // 1. Check cache — always serve today's cached content if it exists.
      //    The passage stays stable while reading; use loadMore() to add new
      //    passages for new vocab words.
      //    NOTE: old cache (from when MAX_WORDS was 10) may have 2 passages.
      //    We cap at MAX_INITIAL_PASSAGES so the page always starts with 1.
      const MAX_INITIAL_PASSAGES = 1;
      const cached = await storage.getDailyContent(hskLevel);
      if (cached && !cancelled) {
        const migrated = migrateContent(cached as unknown as Record<string, unknown>);
        if (migrated) {
          sanitizeCachedContent(migrated);
          if (migrated.passages.length > MAX_INITIAL_PASSAGES) {
            migrated.passages = migrated.passages.slice(0, MAX_INITIAL_PASSAGES);
          }
          setDailyContent(migrated);
          setStatus('ready');
          return;
        }
      }

      // 2. Select words to practice today
      //    Priority: due words (dueAt <= today) sorted most-overdue first, then by fewest reviews.
      //    If nothing is due, fall back to least-reviewed deck words so first-time users always get content.
      const todayStr = new Date().toISOString().slice(0, 10);
      const currentDeck = deckRef.current;

      // Due words — sorted most-overdue first, then fewest reviews
      const dueWords = currentDeck
        .filter(w => !w.dueAt || w.dueAt <= todayStr)
        .sort((a, b) => {
          if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
          return (a.reviews ?? 0) - (b.reviews ?? 0);
        });

      // Pad with non-due words (least reviewed) to always fill at least one batch (MIN_WORDS).
      // This ensures new users or fully-reviewed-for-today users still get a passage.
      // Pad up to MIN_WORDS even if fewer are due today
      const notDue = currentDeck
        .filter(w => w.dueAt && w.dueAt > todayStr)
        .sort((a, b) => (a.reviews ?? 0) - (b.reviews ?? 0));

      const combined = [...dueWords, ...notDue];
      const selectedWords = combined.slice(0, Math.max(MIN_WORDS, Math.min(combined.length, MAX_WORDS)));

      // 3. Call API
      try {
        const res = await fetch('/api/daily-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            words: selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m })),
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
          throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
        }

        const payload = await res.json();
        const { data, vocabWords, batches } = payload as {
          data: Record<string, unknown>;
          vocabWords: string[];
          batches: string[][];
        };

        const dueSet = new Set(vocabWords);
        const deckMeanings = new Map(selectedWords.map(w => [w.h, w.m]));
        const passageData = getPassageData(hskLevel);
        const today = new Date().toISOString().slice(0, 10);

        // 4. Build passages array from API response
        const rawPassages = Array.isArray(data.passages) ? data.passages : [];
        let passages: DailyPassage[] = rawPassages.map((p: unknown, pi: number) =>
          buildPassage(
            p as { title: RawTok[]; sentences: RawTok[][]; questions?: unknown[] },
            batches[pi] ?? [],
            dueSet,
            deckMeanings,
          )
        );

        // Fall back to static passage if AI produced nothing usable
        if (passages.length === 0 || passages[0].sentences.length < 2) {
          passages = [{
            titleTokens: passageData.titleTokens,
            sentences: passageData.sentences,
            vocabWords,
            questions: passageData.questions,
          }];
        }

        const content: DailyContent = {
          date: today,
          hskLevel,
          passages,
          fillItems: buildFillItems(data.fill as unknown[], dueSet, deckMeanings),
          conversation: buildConvo(data.convo as unknown[], dueSet, deckMeanings),
        };

        // Validate minimums — supplement with static if generation was too short
        if (content.fillItems.length < 1) content.fillItems = passageData.fillItems;
        if (content.conversation.length < 2) content.conversation = passageData.conversation;

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

  /**
   * Generate one more passage and append it to the existing list.
   * Prefers vocab words not yet covered by existing passages.
   * Picks a shifted daily theme so the story is different from the first.
   */
  const loadMore = useCallback(async () => {
    if (!dailyContent || loadingMore || hskLevel === 0) return;
    setLoadingMore(true);

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const currentDeck = deckRef.current;

      // Prefer words not covered by any existing passage
      const coveredWords = new Set(dailyContent.passages.flatMap(p => p.vocabWords));
      const dueWords = currentDeck
        .filter(w => !w.dueAt || w.dueAt <= todayStr)
        .sort((a, b) => {
          if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
          return (a.reviews ?? 0) - (b.reviews ?? 0);
        });
      const notDue = currentDeck
        .filter(w => w.dueAt && w.dueAt > todayStr)
        .sort((a, b) => (a.reviews ?? 0) - (b.reviews ?? 0));
      const allSorted = [...dueWords, ...notDue];
      const uncovered = allSorted.filter(w => !coveredWords.has(w.h));
      // Use uncovered if enough; otherwise fall back to all words
      const pool = uncovered.length >= MIN_WORDS ? uncovered : allSorted;
      const selectedWords = pool.slice(0, MAX_WORDS);

      if (selectedWords.length < 1) return;

      const res = await fetch('/api/daily-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m })),
          hskLevel,
          themeOffset: dailyContent.passages.length, // pick a different theme
          passageOnly: true, // skip fill/convo for smaller, faster output
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const payload = await res.json() as { data: Record<string, unknown>; vocabWords: string[]; batches: string[][] };
      const { data, vocabWords, batches } = payload;

      const dueSet = new Map(selectedWords.map(w => [w.h, w.m]));
      const dueSetWords = new Set(vocabWords);
      const rawPassages = Array.isArray(data.passages) ? data.passages : [];
      if (rawPassages.length === 0) return;

      const newPassage = buildPassage(
        rawPassages[0] as { title: RawTok[]; sentences: RawTok[][]; questions?: unknown[] },
        batches[0] ?? [],
        dueSetWords,
        dueSet,
      );

      setDailyContent(prev => {
        if (!prev) return prev;
        const updated: DailyContent = { ...prev, passages: [...prev.passages, newPassage] };
        storage.saveDailyContent(updated);
        return updated;
      });
    } catch (err) {
      console.error('[loadMore]', err);
    } finally {
      setLoadingMore(false);
    }
  }, [dailyContent, loadingMore, hskLevel]);

  return { dailyContent, status, errorMsg, loadMore, loadingMore };
}
