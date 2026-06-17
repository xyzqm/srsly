'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { PassageToken, Sentence, FillItem, ConvoTurn, Question, MCOption, DailyContent, DailyPassage, DeckWord, ContentSection } from '@/lib/types';
import { storage } from '@/lib/storage';
import { getPassageData } from '@/lib/data/allPassages';
import { lookupWord, preloadCedict } from '@/lib/data/dict';
import { groupReadings, pickReading, type ReadingHint } from '@/lib/readings';
import { buildAnchorMap } from '@/lib/anchors';
import { isDueToday, inStudyDeck } from '@/lib/deck';

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
  if (!pinyin) {
    // No reading found. A single char is treated as punct/unknown; a multi-character
    // CJK run is an un-segmented phrase (e.g. the model didn't insert | bars) — leave it
    // untyped so degroupOversized explodes it into characters and re-merges real words.
    const cjkCount = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length;
    return cjkCount >= 2 ? { text } : { text, type: 'punct' };
  }
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
    distractors: string[][];
  }[]).map(f => {
    // Distractors arrive as bare hanzi (the model no longer emits pinyin); resolve
    // their reading from the dictionary so the click-popup shows pinyin.
    const options: FillItem['options'] = [
      [f.answer[0], f.answer[1] || lookupWord(f.answer[0]).pinyin || '', true],
      ...f.distractors.map(d => {
        const h = d[0];
        return [h, d[1] || lookupWord(h).pinyin || '', false] as [string, string, boolean];
      }),
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

const ALL_SECTIONS: ContentSection[] = ['passage', 'fill', 'convo'];

export type DailyContentStatus = 'idle' | 'loading' | 'ready' | 'error' | 'no-key';

export interface UseDailyContentResult {
  dailyContent: DailyContent | null;
  status: DailyContentStatus;
  errorMsg: string;
  /** Sections currently being generated (drives per-block spinners). */
  generating: Set<ContentSection>;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
}

/** Which cached sections were AI-generated, tolerating legacy `complete`-only caches. */
function sectionFlags(c: DailyContent): { passage?: boolean; fill?: boolean; convo?: boolean } {
  if (c.sections) return c.sections;
  return c.complete ? { passage: true, fill: true, convo: true } : {};
}

/** Merge one freshly-generated block into a DailyContent, leaving the others intact. */
function mergeSection(
  c: DailyContent,
  section: ContentSection,
  built: DailyPassage[] | FillItem[] | ConvoTurn[],
  done: boolean,
): DailyContent {
  const sections = { ...sectionFlags(c) };
  if (section === 'passage') {
    sections.passage = done;
    const passages = built as DailyPassage[];
    return { ...c, passages: passages.length ? passages : c.passages, sections };
  }
  if (section === 'fill') {
    sections.fill = done;
    const fill = built as FillItem[];
    return { ...c, fillItems: fill.length ? fill : c.fillItems, sections };
  }
  sections.convo = done;
  const convo = built as ConvoTurn[];
  return { ...c, conversation: convo.length ? convo : c.conversation, sections };
}

/**
 * Loads (or generates) today's AI-driven practice content.
 *
 * Generation is lazy and per-section: a consumer declares the blocks it needs via
 * `want`, and only those are generated (the first time their tab/mode is opened),
 * then merged into the shared per-day cache. The Read tab asks for `['passage']`;
 * the Practice tab asks for `['fill']` or `['convo']` as the user switches modes.
 *
 * A fresh AI passage is auto-generated every day on first load (even with an empty
 * deck). Fill/convo are only generated when there are due words to anchor on.
 */
export function useDailyContent(
  hskLevel: number,
  deck: DeckWord[],
  studyDeck = '',
  want: ContentSection[] = ALL_SECTIONS,
): UseDailyContentResult {
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [status, setStatus] = useState<DailyContentStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [generating, setGenerating] = useState<Set<ContentSection>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);

  // Stable ref so async closures always see latest deck without being deps
  const deckRef = useRef(deck);
  deckRef.current = deck;

  // Stable dependency for the effect (arrays change identity each render).
  const wantKey = [...want].sort().join(',');

  useEffect(() => {
    if (hskLevel === 0) return;

    let cancelled = false;
    const wantSet = new Set(wantKey ? wantKey.split(',') as ContentSection[] : []);

    async function load() {
      setStatus(prev => (prev === 'ready' ? prev : 'loading'));
      // Bare-hanzi tokens depend on full dictionary coverage at parse time.
      await preloadCedict().catch(() => {});
      if (cancelled) return;

      const passageData = getPassageData(hskLevel);
      const today = new Date().toISOString().slice(0, 10);

      // Helper: wrap static data as a DailyContent baseline (no AI sections yet)
      const staticContent = (): DailyContent => ({
        date: today,
        hskLevel,
        deck: studyDeck || undefined,
        passages: [{
          titleTokens: passageData.titleTokens,
          sentences: passageData.sentences,
          vocabWords: [],
          questions: passageData.questions,
        }],
        fillItems: passageData.fillItems,
        conversation: passageData.conversation,
        sections: {},
      });

      // Words due today (within the selected study deck) drive generation.
      const currentDeck = deckRef.current;
      const dueWords = currentDeck
        .filter(w => isDueToday(w, today) && inStudyDeck(w, studyDeck))
        .sort((a, b) => {
          if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
          return (a.reviews ?? 0) - (b.reviews ?? 0);
        });
      const selectedWords = dueWords.slice(0, MAX_WORDS);
      const hasDueWords = selectedWords.length > 0;

      // 1. Load today's cache (for this deck) and show it immediately. Sections that
      // weren't AI-generated yet keep their static fallback so nothing is ever empty.
      const MAX_INITIAL_PASSAGES = 1;
      const cached = await storage.getDailyContent(hskLevel, studyDeck);
      if (cancelled) return;
      let base: DailyContent | null = null;
      if (cached) {
        const migrated = migrateContent(cached as unknown as Record<string, unknown>);
        if (migrated) {
          sanitizeCachedContent(migrated);
          if (migrated.passages.length > MAX_INITIAL_PASSAGES) {
            migrated.passages = migrated.passages.slice(0, MAX_INITIAL_PASSAGES);
          }
          base = migrated;
        }
      }
      const content = base ?? staticContent();
      setDailyContent(content);
      setStatus('ready');

      // 2. Decide which wanted sections still need generation. The daily passage is
      // generated even with an empty deck; fill/convo require due words to anchor on.
      const flags = sectionFlags(content);
      const needed: ContentSection[] = [];
      if (wantSet.has('passage') && !flags.passage) needed.push('passage');
      if (wantSet.has('fill')    && hasDueWords && !flags.fill)  needed.push('fill');
      if (wantSet.has('convo')   && hasDueWords && !flags.convo) needed.push('convo');
      if (needed.length === 0) return;

      setGenerating(new Set(needed));

      // 3. Generate each needed section, merging into both state and the shared cache.
      for (const section of needed) {
        if (cancelled) break;
        try {
          const res = await fetch('/api/daily-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              words: selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m, compounds: w.compounds })),
              hskLevel,
              sections: [section],
            }),
          });
          if (cancelled) return;

          if (res.status === 503) { setStatus('no-key'); break; }
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
          }

          const payload = await res.json();
          const { data, vocabWords, batches, complete } = payload as {
            data: Record<string, unknown>;
            vocabWords: string[];
            batches: string[][];
            complete?: { passage?: boolean; fill?: boolean; convo?: boolean };
          };

          const dueSet = new Set(vocabWords);
          const deckReadings = groupReadings(selectedWords);
          const anchorCompounds = new Set(buildAnchorMap(selectedWords).keys());

          let built: DailyPassage[] | FillItem[] | ConvoTurn[] = [];
          let done = false;
          if (section === 'passage') {
            const buildSet = new Set([...dueSet, ...anchorCompounds]);
            const rawPassages = Array.isArray(data.passages) ? data.passages : [];
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
            const fellBack = passages.length === 0 || passages[0].sentences.length < 2;
            if (fellBack) passages = staticContent().passages;
            built = passages;
            done = !fellBack && complete?.passage !== false;
          } else if (section === 'fill') {
            const builtFill = data.fill ? buildFillItems(data.fill as unknown[], dueSet, deckReadings) : [];
            const fellBack = builtFill.length < 1;
            built = fellBack ? passageData.fillItems : builtFill;
            done = !fellBack && complete?.fill !== false;
          } else {
            const builtConvo = data.convo ? buildConvo(data.convo as unknown[], dueSet, deckReadings) : [];
            const fellBack = builtConvo.length < 2;
            built = fellBack ? passageData.conversation : builtConvo;
            done = !fellBack && complete?.convo !== false;
          }

          if (cancelled) return;

          // Merge into the latest on-disk cache so a sibling tab's section isn't lost.
          const disk = await storage.getDailyContent(hskLevel, studyDeck);
          if (cancelled) return;
          const diskBase = disk
            ? (migrateContent(disk as unknown as Record<string, unknown>) ?? content)
            : content;
          const merged = mergeSection(
            { ...diskBase, date: today, hskLevel, deck: studyDeck || undefined },
            section, built, done,
          );
          await storage.saveDailyContent(merged);
          if (cancelled) return;
          setDailyContent(prev => mergeSection(prev ?? content, section, built, done));
        } catch (err) {
          if (cancelled) return;
          console.error('[useDailyContent]', section, err);
          setErrorMsg(String(err));
          setStatus('error');
        } finally {
          setGenerating(prev => {
            const next = new Set(prev);
            next.delete(section);
            return next;
          });
        }
      }
    }

    load();
    return () => { cancelled = true; };
  // Re-run on HSK level, study-deck, or requested-section change.
  // Vocab-deck content changes never auto-regenerate (deck is read via deckRef).
  }, [hskLevel, studyDeck, wantKey]);

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

      // "+ new passage" should ALWAYS produce a passage, even when nothing is due today.
      // Preference order: due words not yet covered → any due → in-scope words not yet
      // covered → any in-scope word. An empty deck falls through to a generic passage.
      const coveredWords = new Set(dailyContent.passages.flatMap(p => p.vocabWords));
      const inScope = currentDeck.filter(w => inStudyDeck(w, studyDeck));
      const dueWords = inScope
        .filter(w => isDueToday(w, todayStr))
        .sort((a, b) => {
          if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
          return (a.reviews ?? 0) - (b.reviews ?? 0);
        });
      const notCovered = (ws: DeckWord[]) => ws.filter(w => !coveredWords.has(w.h));
      const pool =
        notCovered(dueWords).length ? notCovered(dueWords) :
        dueWords.length             ? dueWords :
        notCovered(inScope).length  ? notCovered(inScope) :
        inScope;
      const selectedWords = pool.slice(0, MAX_WORDS);

      const res = await fetch('/api/daily-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m, compounds: w.compounds })),
          hskLevel,
          themeOffset: dailyContent.passages.length, // pick a different theme
          sections: ['passage'], // skip fill/convo for smaller, faster output
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
  }, [dailyContent, loadingMore, hskLevel, studyDeck]);

  return { dailyContent, status, errorMsg, generating, loadMore, loadingMore };
}
