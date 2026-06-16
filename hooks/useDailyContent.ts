'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { PassageToken, Sentence, FillItem, ConvoTurn, Question, MCOption, DailyContent, DailyPassage, DeckWord } from '@/lib/types';
import { storage } from '@/lib/storage';
import { getPassageData } from '@/lib/data/allPassages';
import { lookupWord } from '@/lib/data/dict';
import { groupReadings, pickReading, type ReadingHint } from '@/lib/readings';
import { buildAnchorMap } from '@/lib/anchors';

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

function rawToToken(arr: RawTok, dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>): PassageToken {
  const [text, rawPinyin, meaning] = arr as [string, string?, string?];
  if (isPunct(text)) return { text, type: 'punct' };
  // If the AI omitted pinyin for a CJK word, look it up in the dictionary so it
  // still gets an underline and is clickable. Only fall back to plain punct if
  // the word is genuinely unknown (not in dict and not in the user's deck).
  const pinyin = rawPinyin || lookupWord(text).pinyin || '';
  if (!pinyin) return { text, type: 'punct' };
  const dictEntry = lookupWord(text, pinyin, '');
  // For a character with multiple deck readings, pick the one matching this token's pinyin.
  const resolvedMeaning = meaning || pickReading(deckReadings.get(text), pinyin)?.m || dictEntry.meaning || '';
  if (dueWords.has(text) || resolvedMeaning) {
    return { text, pinyin, meaning: resolvedMeaning, type: 'vocab' };
  }
  return { text, pinyin };
}

/**
 * Merge adjacent single-character tokens whose combined text is a known word
 * in the dictionary. Tries 3-char combinations first, then 2-char.
 * This repairs AI over-segmentation (e.g. 互+联+网→互联网, 已+经→已经).
 * Only CJK single-char tokens are candidates; punctuation and already-multi-char
 * tokens are left alone.
 */
function mergeCompoundTokens(
  tokens: PassageToken[],
  dueWords: Set<string>,
  deckReadings: Map<string, ReadingHint[]>,
): PassageToken[] {
  const result: PassageToken[] = [];
  let i = 0;
  const isSingleCJK = (t: PassageToken | undefined): t is PassageToken =>
    !!t && t.text.length === 1 && t.type !== 'punct' && /[一-鿿]/.test(t.text);

  while (i < tokens.length) {
    const curr  = tokens[i];
    const next  = tokens[i + 1];
    const next2 = tokens[i + 2];

    // Try 3-char merge first (互联网, 程序员, etc.)
    if (isSingleCJK(curr) && isSingleCJK(next) && isSingleCJK(next2)) {
      const tri = curr.text + next.text + next2.text;
      const e3  = lookupWord(tri);
      if (e3.pinyin) {
        const meaning = pickReading(deckReadings.get(tri), e3.pinyin)?.m || e3.meaning;
        result.push({ text: tri, pinyin: e3.pinyin, meaning: meaning || undefined, type: (dueWords.has(tri) || meaning) ? 'vocab' : undefined });
        i += 3;
        continue;
      }
    }

    // Try 2-char merge
    if (isSingleCJK(curr) && isSingleCJK(next)) {
      const bi = curr.text + next.text;
      const e2 = lookupWord(bi);
      if (e2.pinyin) {
        const meaning = pickReading(deckReadings.get(bi), e2.pinyin)?.m || e2.meaning;
        result.push({ text: bi, pinyin: e2.pinyin, meaning: meaning || undefined, type: (dueWords.has(bi) || meaning) ? 'vocab' : undefined });
        i += 2;
        continue;
      }
    }

    result.push(curr);
    i++;
  }
  return result;
}

const CJK_RE = /[一-鿿㐀-䶿]/;

/**
 * Fix tokens that are unwanted AI phrase-groups.
 *
 * Strategy per token:
 *  - Single char or punctuation → keep as-is.
 *  - Very long (≥5 CJK chars) → always explode, regardless of dictionary.
 *  - 2–4 CJK chars → keep if the text is a known dictionary word, OR if it
 *    is already marked as a due vocab word (type==='vocab', in dueWords/deckReadings).
 *    Otherwise explode (e.g. "的力量", "成为了").
 *
 * After exploding, re-run mergeCompoundTokens so real 2-char compounds
 * (e.g. 力+量→力量) are re-assembled.
 */
function degroupOversized(
  tokens: PassageToken[],
  dueWords: Set<string>,
  deckReadings: Map<string, ReadingHint[]>,
): PassageToken[] {
  const exploded: PassageToken[] = [];

  function explodeToken(t: PassageToken) {
    for (const ch of t.text) {
      if (CJK_RE.test(ch)) {
        const entry = lookupWord(ch);
        exploded.push({
          text: ch,
          pinyin: entry.pinyin || undefined,
          meaning: entry.meaning || undefined,
          type: entry.pinyin ? 'vocab' : undefined,
        });
      } else {
        exploded.push({ text: ch, type: isPunct(ch) ? 'punct' : undefined });
      }
    }
  }

  for (const t of tokens) {
    const cjkCount = (t.text.match(new RegExp(CJK_RE.source, 'g')) ?? []).length;

    // Single chars and punctuation — always keep
    if (t.type === 'punct' || cjkCount <= 1) {
      exploded.push(t);
      continue;
    }

    // Very long phrases (≥5 CJK chars) — always explode
    if (cjkCount >= 5) {
      explodeToken(t);
      continue;
    }

    // 2–4 CJK chars: keep if it is a known dict word OR an explicit vocab/due word
    const entry = lookupWord(t.text);
    if (entry.pinyin || dueWords.has(t.text) || deckReadings.has(t.text) || t.type === 'vocab') {
      exploded.push(t);
    } else {
      explodeToken(t);
    }
  }

  return mergeCompoundTokens(exploded, dueWords, deckReadings);
}

function buildSentences(rawRows: RawTok[][], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>): Sentence[] {
  return rawRows.map(row => {
    const raw = row
      .filter(r => r[0] !== '' && r[0] !== 'punctuation')
      .map(r => rawToToken(r, dueWords, deckReadings));
    const tokens = degroupOversized(raw, dueWords, deckReadings);
    return { tokens, plainText: tokens.map(t => t.text).join('') };
  });
}

function buildFillItems(rawFills: unknown[], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>): FillItem[] {
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
    const build = (arr: RawTok[]) =>
      degroupOversized(
        arr.filter(r => r[0] !== '' && r[0] !== 'punctuation').map(r => rawToToken(r, dueWords, deckReadings)),
        dueWords, deckReadings,
      );
    return {
      before: build(f.before),
      answer: f.answer,
      after:  build(f.after),
      options,
    };
  });
}

function buildConvo(rawTurns: unknown[], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>): ConvoTurn[] {
  return (rawTurns as {
    key: string[];
    tutor: RawTok[];
    suggestions: RawTok[][];
  }[]).map(t => ({
    key: t.key,
    tokens: t.tutor.map(r => rawToToken(r, dueWords, deckReadings)),
    suggestions: t.suggestions.map(sug => sug.map(r => rawToToken(r, dueWords, deckReadings))),
  }));
}

function buildTitleTokens(rawTitle: RawTok[], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>): PassageToken[] {
  const raw = rawTitle
    .filter(r => r[0] !== '' && r[0] !== 'punctuation')
    .map(r => rawToToken(r, dueWords, deckReadings));
  return degroupOversized(raw, dueWords, deckReadings);
}

function buildQuestions(rawQuestions: unknown[], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>): Question[] {
  return (rawQuestions as {
    q: RawTok[];
    model: string;
    key: string[];
    options: { tokens: RawTok[]; correct: boolean }[];
  }[]).map(q => {
    const buildToks = (arr: RawTok[]) =>
      degroupOversized(
        arr.filter(r => r[0] !== '' && r[0] !== 'punctuation').map(r => rawToToken(r, dueWords, deckReadings)),
        dueWords, deckReadings,
      );
    const options: MCOption[] = q.options.map(opt => ({
      tokens: buildToks(opt.tokens),
      correct: opt.correct,
    }));
    // Fisher-Yates shuffle so the correct answer isn't always first
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return {
      q: buildToks(q.q),
      model: q.model,
      key: q.key,
      options,
    };
  });
}

/**
 * A passage's review words = the surface forms that actually appear AND are
 * either a sent due word or an anchor compound (e.g. 银行 standing in for 行 háng).
 * Computed from real tokens so a compound the model chose is counted, and a sent
 * word the model dropped is not.
 */
function collectVocabWords(
  passage: DailyPassage,
  dueSet: Set<string>,
  anchorCompounds: Set<string>,
): string[] {
  const present = new Set<string>();
  const scan = (toks: PassageToken[]) => {
    for (const t of toks) {
      if (t.type === 'punct') continue;
      if (dueSet.has(t.text) || anchorCompounds.has(t.text)) present.add(t.text);
    }
  };
  passage.sentences.forEach(s => scan(s.tokens));
  scan(passage.titleTokens);
  return [...present];
}

/** Build a single DailyPassage from raw API output. */
function buildPassage(
  rawPassage: { title: RawTok[]; sentences: RawTok[][]; questions?: unknown[] },
  vocabWords: string[],
  dueSet: Set<string>,
  deckReadings: Map<string, ReadingHint[]>,
): DailyPassage {
  const rawQs = Array.isArray(rawPassage.questions) ? rawPassage.questions : [];
  const aiQs = rawQs.length >= 1 ? buildQuestions(rawQs, dueSet, deckReadings) : undefined;
  return {
    titleTokens: buildTitleTokens(rawPassage.title, dueSet, deckReadings),
    sentences: buildSentences(rawPassage.sentences, dueSet, deckReadings),
    vocabWords,
    questions: aiQs,
  };
}

/**
 * Retroactively fix cached content:
 * 1. Punctuation tokens that still have a pinyin field get cleaned up.
 * 2. Oversized phrase tokens (≥5 CJK chars) get split into individual
 *    characters then re-merged via mergeCompoundTokens — same logic as
 *    degroupOversized at parse time, but applied post-hoc to cached data.
 */
function sanitizeCachedContent(content: DailyContent): void {
  const emptyDue = new Set<string>();
  const emptyMeanings = new Map<string, ReadingHint[]>();

  function fixToken(t: PassageToken) {
    if (t.pinyin && isPunct(t.text)) {
      (t as unknown as Record<string, unknown>).pinyin = undefined;
      t.type = 'punct';
    }
  }

  function fixAndDegroup(tokens: PassageToken[]): PassageToken[] {
    tokens.forEach(fixToken);
    return degroupOversized(tokens, emptyDue, emptyMeanings);
  }

  content.passages.forEach(p => {
    p.titleTokens = fixAndDegroup(p.titleTokens);
    p.sentences.forEach(s => {
      s.tokens = fixAndDegroup(s.tokens);
      s.plainText = s.tokens.map(t => t.text).join('');
    });
    p.questions?.forEach(q => {
      q.q = fixAndDegroup(q.q);
      q.options.forEach(opt => { opt.tokens = fixAndDegroup(opt.tokens); });
      // Shuffle options so the correct answer isn't pinned to position 0
      for (let i = q.options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
      }
    });
  });

  content.fillItems.forEach(fi => {
    fi.before = fixAndDegroup(fi.before);
    fi.after  = fixAndDegroup(fi.after);
  });

  content.conversation.forEach(turn => {
    turn.tokens = fixAndDegroup(turn.tokens);
    turn.suggestions = turn.suggestions.map(sug => fixAndDegroup(sug));
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

/** Max due words sent per passage to the API. */
const MAX_WORDS = 5;

export type DailyContentStatus = 'idle' | 'loading' | 'ready' | 'error' | 'no-key';

export interface UseDailyContentResult {
  dailyContent: DailyContent | null;
  status: DailyContentStatus;
  errorMsg: string;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
}

/**
 * Loads (or generates) today's AI-driven practice content.
 *
 * A fresh AI passage is auto-generated every day on first load (even with an
 * empty deck). Adding words never auto-regenerates — users press "+ new passage"
 * (loadMore) to get a passage on a different topic using their current words.
 */
export function useDailyContent(hskLevel: number, deck: DeckWord[]): UseDailyContentResult {
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [status, setStatus] = useState<DailyContentStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  // Stable ref so async closures always see latest deck without being deps
  const deckRef = useRef(deck);
  deckRef.current = deck;

  useEffect(() => {
    if (hskLevel === 0) return;

    let cancelled = false;

    async function load() {
      setStatus('loading');

      const passageData = getPassageData(hskLevel);
      const today = new Date().toISOString().slice(0, 10);

      // Helper: wrap static data as a DailyContent baseline
      const staticContent = (): DailyContent => ({
        date: today,
        hskLevel,
        passages: [{
          titleTokens: passageData.titleTokens,
          sentences: passageData.sentences,
          vocabWords: [],
          questions: passageData.questions,
        }],
        fillItems: passageData.fillItems,
        conversation: passageData.conversation,
      });

      // Words due today drive both the cache-freshness check and generation.
      const currentDeck = deckRef.current;
      const dueWords = currentDeck
        .filter(w => !w.dueAt || w.dueAt <= today)
        .sort((a, b) => {
          if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
          return (a.reviews ?? 0) - (b.reviews ?? 0);
        });
      const selectedWords = dueWords.slice(0, MAX_WORDS);
      const hasDueWords = selectedWords.length > 0;

      // 1. Check cache — serve today's cached content if it's complete. If it fell back
      // to static fill/convo while the user has due words, regenerate instead so the
      // fill reflects the deck rather than showing generic static items all day.
      const MAX_INITIAL_PASSAGES = 1;
      const cached = await storage.getDailyContent(hskLevel);
      if (cached && !cancelled) {
        const migrated = migrateContent(cached as unknown as Record<string, unknown>);
        if (migrated && (migrated.complete === true || !hasDueWords)) {
          sanitizeCachedContent(migrated);
          if (migrated.passages.length > MAX_INITIAL_PASSAGES) {
            migrated.passages = migrated.passages.slice(0, MAX_INITIAL_PASSAGES);
          }
          setDailyContent(migrated);
          setStatus('ready');
          return;
        }
      }

      // 2. No usable cache — generate from the due words computed above.

      try {
        const res = await fetch('/api/daily-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            words: selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m, compounds: w.compounds })),
            hskLevel,
          }),
        });

        if (cancelled) return;

        if (res.status === 503) {
          setDailyContent(staticContent());
          setStatus('no-key');
          return;
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
        }

        const payload = await res.json();
        const { data, vocabWords, batches, complete } = payload as {
          data: Record<string, unknown>;
          vocabWords: string[];
          batches: string[][];
          complete?: boolean;
        };

        const dueSet = new Set(vocabWords);
        const deckReadings = groupReadings(selectedWords);
        const anchorCompounds = new Set(buildAnchorMap(selectedWords).keys());

        // 4. Build passages from API response
        const rawPassages = Array.isArray(data.passages) ? data.passages : [];
        // Treat anchor compounds as due so their tokens highlight as review words.
        const buildSet = new Set([...dueSet, ...anchorCompounds]);
        let passages: DailyPassage[] = rawPassages.map((p: unknown, pi: number) => {
          const passage = buildPassage(
            p as { title: RawTok[]; sentences: RawTok[][]; questions?: unknown[] },
            batches[pi] ?? [],
            buildSet,
            deckReadings,
          );
          passage.vocabWords = collectVocabWords(passage, dueSet, anchorCompounds);
          return passage;
        });

        if (passages.length === 0 || passages[0].sentences.length < 2) {
          passages = staticContent().passages;
        }

        // Build fill/convo and track when the model omitted them. A static fallback is
        // fine to *show*, but we must not cache it as the day's "complete" content —
        // otherwise generic static fill would be frozen in all day. Passage-only days
        // (no due words) legitimately have static fill and count as complete.
        const builtFill  = data.fill  ? buildFillItems(data.fill as unknown[], dueSet, deckReadings) : [];
        const builtConvo = data.convo ? buildConvo(data.convo as unknown[], dueSet, deckReadings) : [];
        const fillFellBack  = builtFill.length < 1;
        const convoFellBack = builtConvo.length < 2;

        const content: DailyContent = {
          date: today,
          hskLevel,
          passages,
          fillItems:    fillFellBack  ? passageData.fillItems    : builtFill,
          conversation: convoFellBack ? passageData.conversation : builtConvo,
          complete: hasDueWords ? (complete !== false && !fillFellBack && !convoFellBack) : true,
        };

        if (cancelled) return;
        await storage.saveDailyContent(content);
        setDailyContent(content);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[useDailyContent]', err);
        setErrorMsg(String(err));
        setDailyContent(staticContent());
        setStatus('error');
      }
    }

    load();
    return () => { cancelled = true; };
  // Only re-run when hskLevel changes. Deck changes never auto-regenerate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hskLevel]);

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

      // Prefer due words not yet covered by existing passages
      const coveredWords = new Set(dailyContent.passages.flatMap(p => p.vocabWords));
      const dueWords = currentDeck
        .filter(w => !w.dueAt || w.dueAt <= todayStr)
        .sort((a, b) => {
          if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
          return (a.reviews ?? 0) - (b.reviews ?? 0);
        });
      const uncovered = dueWords.filter(w => !coveredWords.has(w.h));
      const pool = uncovered.length >= 1 ? uncovered : dueWords;
      const selectedWords = pool.slice(0, MAX_WORDS);

      if (selectedWords.length < 1) return;

      const res = await fetch('/api/daily-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m, compounds: w.compounds })),
          hskLevel,
          themeOffset: dailyContent.passages.length, // pick a different theme
          passageOnly: true, // skip fill/convo for smaller, faster output
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail ?? errBody.error ?? `HTTP ${res.status}`);
      }

      const payload = await res.json() as { data: Record<string, unknown>; vocabWords: string[]; batches: string[][] };
      const { data, vocabWords, batches } = payload;

      const dueSet = groupReadings(selectedWords);
      const dueSetWords = new Set(vocabWords);
      const anchorCompounds = new Set(buildAnchorMap(selectedWords).keys());
      const rawPassages = Array.isArray(data.passages) ? data.passages : [];
      if (rawPassages.length === 0) return;

      const newPassage = buildPassage(
        rawPassages[0] as { title: RawTok[]; sentences: RawTok[][]; questions?: unknown[] },
        batches[0] ?? [],
        new Set([...dueSetWords, ...anchorCompounds]),
        dueSet,
      );
      newPassage.vocabWords = collectVocabWords(newPassage, dueSetWords, anchorCompounds);

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
