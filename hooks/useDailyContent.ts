'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { PassageToken, Sentence, FillItem, ConvoTurn, Question, MCOption, DailyContent, DailyPassage, DeckWord, ContentSection, LanguageCode } from '@/lib/types';
import { storage } from '@/lib/storage';
import { lookupReading, preloadDict } from '@/lib/data/lookup';
import { groupReadings, pickReading, type ReadingHint } from '@/lib/readings';
import { buildAnchorMap } from '@/lib/anchors';
import { isReadyNow, todayStr, shuffle } from '@/lib/deck';
import { getTodayCounts } from '@/lib/reviewCounts';
import { getSrsSettings } from '@/lib/fsrs';
import { syncGuestAiRemaining, markGuestAiExhausted } from '@/lib/aiBudget';
import { getLanguageConfig, wordsForDensity, RECOMMENDED_BLANK_DENSITY } from '@/lib/languageConfig';
import { tokensToText } from '@/lib/tokenText';
import { aiHeaders } from '@/lib/userApiKey';

export type RawTok = [string] | [string, string] | [string, string, string] | [string, string, string, string];

const PUNCT_CHARS = new Set([
  '。','！','？','，','、','—','…','·','「','」','『','』',
  '\u201c','\u201d','\u2018','\u2019','（','）','【','】','《','》','〈','〉',
  '：','；',',','.',';',':','!','?','(',')','"',"'",'[',']','{','}',
  '–','○','●','□','■','◇','◆','△','▲','▽','▼','★','☆','•','‥',
  '～','~','／','\\','|','`','^',
  // Spanish: the inverted marks that open a question/exclamation, and its quote pair.
  '¿','¡','«','»',
]);

/**
 * A letter in any script srsly supports — CJK, kana, Hangul, or Latin including the
 * accented characters Spanish uses. Without the Latin-1 letter ranges a bare "á" or "ñ"
 * would fall through the single-character test below and be misread as punctuation.
 *
 * The Hangul ranges are listed explicitly even though the CJK range above happens to cover
 * them today: `豈` is U+8C48 (the unified ideograph), not the U+F900 compatibility form, so
 * `豈-﫿` silently spans U+8C48–U+FAFF and swallows the Hangul syllables block by accident.
 * Relying on that would break the moment someone tightened that range.
 */
const LETTER_RE = /[一-鿿㐀-䶿豈-﫿＀-￯぀-ゟ゠-ヿ가-힣ᄀ-ᇿ㄰-㆏a-zA-Z0-9À-ÖØ-öø-ÿ]/;

function isPunct(text: string): boolean {
  if (PUNCT_CHARS.has(text)) return true;
  if (text.length === 1 && !LETTER_RE.test(text)) return true;
  return false;
}

function rawToToken(arr: RawTok, dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode): PassageToken {
  const [text, rawReading, meaning, rawBaseForm] = arr as [string, string?, string?, string?];
  if (isPunct(text)) return { text, type: 'punct' };
  const cfg = getLanguageConfig(lang);
  const baseForm = cfg.usesBaseForms && rawBaseForm && rawBaseForm !== text ? rawBaseForm : undefined;

  // Languages with no reading layer (Spanish) classify a token as vocab on its MEANING.
  // The reading-gated path below would drop every Spanish word to plain text, since there
  // is no pinyin/furigana to resolve — nothing would ever become a cloze blank.
  if (!cfg.hasReadings) {
    const resolvedMeaning = meaning
      || (baseForm ? lookupReading(lang, baseForm).meaning : '')
      || lookupReading(lang, text).meaning
      || '';
    if (dueWords.has(text) || (baseForm && dueWords.has(baseForm)) || resolvedMeaning) {
      return baseForm
        ? { text, meaning: resolvedMeaning, type: 'vocab', baseForm }
        : { text, meaning: resolvedMeaning, type: 'vocab' };
    }
    // A word we have no definition for is still a word, not punctuation.
    return { text };
  }

  const reading = rawReading || lookupReading(lang, text).reading || '';
  if (!reading) {
    // No reading resolved. For Chinese a 2+ Han-char run is still a word; for Japanese
    // (already segmented server-side, either by the AI's pipe format or kuromoji) any
    // multi-char run is treated as a word too.
    const isWordLike = lang === 'ja' ? text.length >= 2 : (text.match(/[一-鿿㐀-䶿]/g) ?? []).length >= 2;
    return isWordLike ? { text } : { text, type: 'punct' };
  }
  const dictEntry = lookupReading(lang, text, reading, '');
  const resolvedMeaning = meaning || pickReading(deckReadings.get(text), reading)?.m || dictEntry.meaning || '';
  if (dueWords.has(text) || resolvedMeaning) {
    // Inflected words carry their dictionary (base) form as the 4th RawTok element,
    // resolved server-side (kuromoji for ja, the lemmatizer for es). Keep it on EVERY such
    // token — not only due words — so the lookup popup headlines the base form (する, not
    // しています) and "Add to vocab" stores/dedupes against the base-form card. Cloze-blank
    // detection and grade attribution in PassageText still gate on whether the base form is
    // actually a due word, so surfacing it here never turns a non-due word into a blank.
    return baseForm
      ? { text, reading, meaning: resolvedMeaning, type: 'vocab', baseForm }
      : { text, reading, meaning: resolvedMeaning, type: 'vocab' };
  }
  return { text, reading };
}

// Structural / aspect / modal particles that are almost always standalone grammar words.
// We refuse to absorb them into a compound during the greedy single-char merge below, so
// e.g. 中 + 的 (zhōng + particle) doesn't collapse into the rare word 中的 (zhòngdì, "to hit
// the target"). Real words ending in these (目的, 觉得, …) arrive whole from the model and
// never reach this single-char merge path.
const NON_MERGING_PARTICLES = new Set(['的', '了', '着', '地', '吗', '呢', '吧', '啊', '呀', '嘛']);

// Greedy single-character compound merge — only needed where the MODEL did the segmenting
// (the Chinese pipe format, where it emits bare hanzi that may form compounds). Languages
// segmented server-side (ja via kuromoji, es via the Spanish segmenter) arrive correct and
// pass through untouched.
function mergeCompoundTokens(
  tokens: PassageToken[],
  dueWords: Set<string>,
  deckReadings: Map<string, ReadingHint[]>,
  lang: LanguageCode,
): PassageToken[] {
  if (getLanguageConfig(lang).segmentation === 'server') return tokens;
  const result: PassageToken[] = [];
  let i = 0;
  const isSingleCJK = (t: PassageToken | undefined): t is PassageToken =>
    !!t && t.text.length === 1 && t.type !== 'punct' && /[一-鿿]/.test(t.text);

  while (i < tokens.length) {
    const curr  = tokens[i];
    const next  = tokens[i + 1];
    const next2 = tokens[i + 2];

    if (isSingleCJK(curr) && isSingleCJK(next) && isSingleCJK(next2)
        && !NON_MERGING_PARTICLES.has(next.text) && !NON_MERGING_PARTICLES.has(next2.text)) {
      const tri = curr.text + next.text + next2.text;
      const e3  = lookupReading(lang, tri);
      if (e3.reading) {
        const meaning = pickReading(deckReadings.get(tri), e3.reading)?.m || e3.meaning;
        result.push({ text: tri, reading: e3.reading, meaning: meaning || undefined, type: (dueWords.has(tri) || meaning) ? 'vocab' : undefined });
        i += 3;
        continue;
      }
    }

    if (isSingleCJK(curr) && isSingleCJK(next) && !NON_MERGING_PARTICLES.has(next.text)) {
      const bi = curr.text + next.text;
      const e2 = lookupReading(lang, bi);
      if (e2.reading) {
        const meaning = pickReading(deckReadings.get(bi), e2.reading)?.m || e2.meaning;
        result.push({ text: bi, reading: e2.reading, meaning: meaning || undefined, type: (dueWords.has(bi) || meaning) ? 'vocab' : undefined });
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

// Split oversized / mis-grouped runs back into characters, then re-merge real compounds.
// This whole dance exists because the Chinese model emits bare hanzi; server-segmented
// languages (ja, es) arrive already correct and pass through untouched.
function degroupOversized(
  tokens: PassageToken[],
  dueWords: Set<string>,
  deckReadings: Map<string, ReadingHint[]>,
  lang: LanguageCode,
): PassageToken[] {
  if (getLanguageConfig(lang).segmentation === 'server') return tokens;
  const exploded: PassageToken[] = [];

  function explodeToken(t: PassageToken) {
    for (const ch of t.text) {
      if (CJK_RE.test(ch)) {
        const entry = lookupReading(lang, ch);
        exploded.push({
          text: ch,
          reading: entry.reading || undefined,
          meaning: entry.meaning || undefined,
          type: entry.reading ? 'vocab' : undefined,
        });
      } else {
        exploded.push({ text: ch, type: isPunct(ch) ? 'punct' : undefined });
      }
    }
  }

  for (const t of tokens) {
    const cjkCount = (t.text.match(new RegExp(CJK_RE.source, 'g')) ?? []).length;

    if (t.type === 'punct' || cjkCount <= 1) {
      exploded.push(t);
      continue;
    }

    if (cjkCount >= 5) {
      explodeToken(t);
      continue;
    }

    const entry = lookupReading(lang, t.text);
    if (entry.reading || dueWords.has(t.text) || deckReadings.has(t.text) || t.type === 'vocab') {
      exploded.push(t);
    } else {
      explodeToken(t);
    }
  }

  return mergeCompoundTokens(exploded, dueWords, deckReadings, lang);
}

function buildSentences(rawRows: RawTok[][], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode): Sentence[] {
  return rawRows.map(row => {
    const raw = row
      .filter(r => r[0] !== '' && r[0] !== 'punctuation')
      .map(r => rawToToken(r, dueWords, deckReadings, lang));
    const tokens = degroupOversized(raw, dueWords, deckReadings, lang);
    // Through tokensToText, never a local join. `plainText` is not a debug field: it is what
    // the passage shelf stores and what generateQuestionsForPassage sends the model as the
    // text to write questions about. Joined flush it rendered Spanish as
    // "¿Quetalelclimahoy?" — unreadable on the shelf, and unusable as a prompt, which is why
    // the reading-comprehension questions came back blank.
    return { tokens, plainText: tokensToText(tokens, getLanguageConfig(lang).scriptIsUnspaced) };
  });
}

function buildFillItems(rawFills: unknown[], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode): FillItem[] {
  return (rawFills as {
    before: RawTok[];
    answer: [string, string];
    after: RawTok[];
    distractors: string[][];
  }[]).map(f => {
    const options: FillItem['options'] = [
      [f.answer[0], f.answer[1] || lookupReading(lang, f.answer[0]).reading || '', true],
      ...f.distractors.map(d => {
        const h = d[0];
        return [h, d[1] || lookupReading(lang, h).reading || '', false] as [string, string, boolean];
      }),
    ];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    const build = (arr: RawTok[]) =>
      degroupOversized(
        arr.filter(r => r[0] !== '' && r[0] !== 'punctuation').map(r => rawToToken(r, dueWords, deckReadings, lang)),
        dueWords, deckReadings, lang,
      );
    return {
      before: build(f.before),
      answer: f.answer,
      after:  build(f.after),
      options,
    };
  });
}

function buildConvo(rawTurns: unknown[], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode): ConvoTurn[] {
  return (rawTurns as {
    key: string[];
    tutor: RawTok[];
    suggestions: RawTok[][];
  }[]).map(t => ({
    key: t.key,
    tokens: t.tutor.map(r => rawToToken(r, dueWords, deckReadings, lang)),
    suggestions: t.suggestions.map(sug => sug.map(r => rawToToken(r, dueWords, deckReadings, lang))),
  }));
}

function buildTitleTokens(rawTitle: RawTok[], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode): PassageToken[] {
  const raw = rawTitle
    .filter(r => r[0] !== '' && r[0] !== 'punctuation')
    .map(r => rawToToken(r, dueWords, deckReadings, lang));
  return degroupOversized(raw, dueWords, deckReadings, lang);
}

function buildQuestions(rawQuestions: unknown[], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode): Question[] {
  return (rawQuestions as {
    q: RawTok[];
    model: string;
    key: string[];
    options: { tokens: RawTok[]; correct: boolean }[];
  }[]).map(q => {
    const buildToks = (arr: RawTok[]) =>
      degroupOversized(
        arr.filter(r => r[0] !== '' && r[0] !== 'punctuation').map(r => rawToToken(r, dueWords, deckReadings, lang)),
        dueWords, deckReadings, lang,
      );
    const options: MCOption[] = q.options.map(opt => ({
      tokens: buildToks(opt.tokens),
      correct: opt.correct,
    }));
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

/** A card the learner has never been shown — the thing `newPerDay` exists to ration. */
function isNewCard(w: DeckWord): boolean {
  return (w.reviews ?? 0) === 0 && w.stability === undefined && w.phase !== 'learning';
}

/**
 * Pick this passage's target words, spending from the SAME daily new-card budget the
 * flashcard queue spends from.
 *
 * ONE BUDGET, TWO DOORS. A word becomes "introduced" the moment it is graded, and reading
 * grades every blank you fill — so reading introduces cards exactly as flashcards do, and
 * takes on the same future review debt. But only Flashcards.tsx ever consulted
 * lib/reviewCounts.ts, so `newPerDay` was a limit on one door of a two-door room: activate
 * 300 words from the pool and reading would happily introduce all of them, and the backlog
 * arrived next week regardless of the setting.
 *
 * Reviews are NOT rationed here. A passage is a text, not a queue: blank density already
 * bounds how much work it is, and dropping review words would leave prose written around
 * vocabulary it no longer asks about.
 *
 * Returns the words to build around plus how many new ones were held back, so the reader
 * can say so rather than letting them look like they vanished.
 */
function selectTargets(due: DeckWord[], want: number, newBudgetLeft: number): { words: DeckWord[]; heldBack: number } {
  const fresh = due.filter(isNewCard);
  const known = due.filter(w => !isNewCard(w));
  const allowedNew = Math.max(0, Math.min(newBudgetLeft, want));
  const takeNew = fresh.slice(0, allowedNew);
  // Reviews fill whatever the budget left over. Early on there are few of them, so the
  // passage simply gets fewer targets rather than being topped up with new material.
  const takeKnown = known.slice(0, Math.max(0, want - takeNew.length));
  return {
    words: [...takeNew, ...takeKnown],
    heldBack: Math.max(0, fresh.length - takeNew.length),
  };
}

function collectVocabWords(
  passage: DailyPassage,
  dueSet: Set<string>,
  anchorCompounds: Set<string>,
): string[] {
  const present = new Set<string>();
  const scan = (toks: PassageToken[]) => {
    for (const t of toks) {
      if (t.type === 'punct') continue;
      if (dueSet.has(t.text) || anchorCompounds.has(t.text)) { present.add(t.text); continue; }
      // Conjugated Japanese token — attribute to the base form.
      if (t.baseForm && dueSet.has(t.baseForm)) present.add(t.baseForm);
    }
  };
  passage.sentences.forEach(s => scan(s.tokens));
  scan(passage.titleTokens);
  return [...present];
}

function buildPassage(
  rawPassage: { title: RawTok[]; sentences: RawTok[][]; questions?: unknown[]; contextualMeanings?: Record<string, string> },
  vocabWords: string[],
  dueSet: Set<string>,
  deckReadings: Map<string, ReadingHint[]>,
  lang: LanguageCode,
): DailyPassage {
  const rawQs = Array.isArray(rawPassage.questions) ? rawPassage.questions : [];
  const aiQs = rawQs.length >= 1 ? buildQuestions(rawQs, dueSet, deckReadings, lang) : undefined;
  return {
    titleTokens: buildTitleTokens(rawPassage.title, dueSet, deckReadings, lang),
    sentences: buildSentences(rawPassage.sentences, dueSet, deckReadings, lang),
    vocabWords,
    questions: aiQs,
    contextualMeanings: rawPassage.contextualMeanings,
  };
}

/**
 * Turn segmented pasted text into a `DailyPassage` — the same shape the generator produces,
 * so every reader downstream (blanks, the primer, the shelf, passage navigation) works on it
 * unchanged.
 *
 * The one thing that differs from `buildPassage` is the "due words" set handed to the token
 * builder: the WHOLE DECK, not a chosen batch. In the generated path that set names the words
 * the model was asked to write around; here nobody chose anything in advance, so the honest
 * equivalent is "every word I have a card for" — which is what lets a deck word classify as
 * vocab even where the bundled dictionary has no gloss for it.
 *
 * `vocabWords` still arrives from the caller and is still written ONCE, because that is what
 * makes a passage stable to read. The caller (PasteTextPanel) picks it with the same
 * selectClozeTargets call that produced the coverage readout, so what the reader was promised
 * and what the passage contains are the same computation rather than two agreeing ones. It
 * has to be settled at paste time: derive it on every render instead and the deck moves
 * underneath the reader — filling one blank drops another, and finishing the passage makes it
 * sprout fresh ones.
 */
export function buildPastedPassage(
  raw: { title: RawTok[]; sentences: RawTok[][] },
  deck: DeckWord[],
  lang: LanguageCode,
  vocabWords: string[],
): DailyPassage {
  const deckWords = new Set(deck.map(d => d.h));
  const deckReadings = groupReadings(deck);
  return {
    titleTokens: buildTitleTokens(raw.title, deckWords, deckReadings, lang),
    sentences: buildSentences(raw.sentences, deckWords, deckReadings, lang),
    vocabWords,
    pasted: true,
  };
}

function sanitizeCachedContent(content: DailyContent, lang: LanguageCode): void {
  const emptyDue = new Set<string>();
  const emptyMeanings = new Map<string, ReadingHint[]>();

  function fixToken(t: PassageToken) {
    if (t.reading && isPunct(t.text)) {
      (t as unknown as Record<string, unknown>).reading = undefined;
      t.type = 'punct';
    }
  }

  function fixAndDegroup(tokens: PassageToken[]): PassageToken[] {
    tokens.forEach(fixToken);
    return degroupOversized(tokens, emptyDue, emptyMeanings, lang);
  }

  content.passages.forEach(p => {
    p.titleTokens = fixAndDegroup(p.titleTokens);
    p.sentences.forEach(s => {
      s.tokens = fixAndDegroup(s.tokens);
      s.plainText = tokensToText(s.tokens, getLanguageConfig(lang).scriptIsUnspaced);
    });
    p.questions?.forEach(q => {
      q.q = fixAndDegroup(q.q);
      q.options.forEach(opt => { opt.tokens = fixAndDegroup(opt.tokens); });
      // NOT re-shuffled. `buildQuestions` shuffles once, at generation, and the shuffled
      // order is what gets cached — so shuffling again here re-randomised the options on
      // every load of the same passage. The correct answer moved under the reader between
      // visits, and a question they had already answered came back rearranged, which is
      // also what made restoring an answer by option index impossible.
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

function migrateContent(raw: Record<string, unknown>): DailyContent | null {
  if (Array.isArray(raw.passages)) return raw as unknown as DailyContent;
  if (!raw.sentences || !raw.titleTokens) return null;
  return {
    date: raw.date as string,
    language: raw.language as LanguageCode | undefined,
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

const ALL_SECTIONS: ContentSection[] = ['passage', 'fill', 'convo'];

/**
 * True if anything was GENERATED for `today` (across every level/deck scope). Lets us tell
 * the day's first load (auto-generate the passage) apart from a later HSK-level or deck
 * switch (don't auto-generate — just show that scope's cache, so changing a setting never
 * silently burns a generation or wipes the view).
 *
 * This reads the cached content rather than merely testing that its key exists, because
 * pasting text writes to the same per-day cache and a paste is not a generation. Keying off
 * existence meant that pasting an article before the day's passage had been generated
 * suppressed it for the rest of the day — the user would have spent nothing and lost the
 * passage anyway.
 */
function hasAnyDailyContentToday(today: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('srsly-daily-') || !k.endsWith(today)) continue;
    try {
      const c = JSON.parse(localStorage.getItem(k) ?? 'null') as DailyContent | null;
      if (!c) continue;
      if ((c.passages ?? []).some(p => !p.pasted)) return true;
      if ((c.fillItems ?? []).length > 0 || (c.conversation ?? []).length > 0) return true;
    } catch {
      return true;   // unreadable cache — assume generated rather than spend another call
    }
  }
  return false;
}
export type DailyContentStatus = 'idle' | 'loading' | 'ready' | 'error' | 'no-key';

export interface UseDailyContentResult {
  dailyContent: DailyContent | null;
  status: DailyContentStatus;
  errorMsg: string;
  generating: Set<ContentSection>;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  guestLimited: boolean;
  generateQuestionsForPassage: (passageIdx: number) => Promise<void>;
  loadingQuestions: boolean;
  /** Why the last question generation produced nothing. Empty when it worked. */
  questionsError: string;
  /** Append a passage built from text the learner pasted. Spends no AI generation. */
  addPastedPassage: (passage: DailyPassage) => void;
}

function sectionFlags(c: DailyContent): { passage?: boolean; fill?: boolean; convo?: boolean } {
  if (c.sections) return c.sections;
  return c.complete ? { passage: true, fill: true, convo: true } : {};
}

function mergeSection(
  c: DailyContent,
  section: ContentSection,
  built: DailyPassage[] | FillItem[] | ConvoTurn[],
  done: boolean,
): DailyContent {
  const sections = { ...sectionFlags(c) };
  if (section === 'passage') {
    sections.passage = done;
    const generated = built as DailyPassage[];
    if (generated.length === 0) return { ...c, passages: c.passages, sections };
    /**
     * APPEND. This used to assign `passages: generated`, which quietly assumed a completing
     * generation was the only thing that could have put a passage in today's content.
     *
     * Pasting broke that assumption: a generation takes 20–35s, the paste panel sits above
     * the skeleton and works the whole time, so a learner can paste and commit an article
     * while one is still in flight. The wholesale assignment then DELETED it — from state and
     * from localStorage — the moment the generation landed. Measured: paste committed, one
     * passage stored, generation lands, storage holds one passage and it is the generated one.
     *
     * Appending also keeps existing indices fixed, which matters beyond this bug: cloze
     * progress is stored at `srsly-cloze|{contentKey}|{passageIdx}`, so a passage that moves
     * inherits another passage's answers.
     */
    return { ...c, passages: [...c.passages, ...generated], sections };
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

export function useDailyContent(
  hskLevel: number,
  deck: DeckWord[],
  want: ContentSection[] = ALL_SECTIONS,
  language: LanguageCode = 'zh',
  blankDensity?: number,
): UseDailyContentResult {
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [status, setStatus] = useState<DailyContentStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [generating, setGenerating] = useState<Set<ContentSection>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState('');
  const [guestLimited, setGuestLimited] = useState(false);

  const deckRef = useRef(deck);
  deckRef.current = deck;
  // How many due words to build each passage/fill/convo batch around. Falls back to a
  // level-scaled recommendation (harder levels support longer passages, so more words fit
  // without overwhelming the reader) when the user hasn't set an explicit preference.
  // One density setting, converted to a word count per level — see wordsForDensity.
  const effectiveWordsPerPassage = wordsForDensity(language, hskLevel, blankDensity ?? RECOMMENDED_BLANK_DENSITY);
  const wordsPerPassageRef = useRef(effectiveWordsPerPassage);
  wordsPerPassageRef.current = effectiveWordsPerPassage;

  const wantKey = [...want].sort().join(',');

  useEffect(() => {
    if (hskLevel === 0) return;

    let cancelled = false;
    const wantSet = new Set(wantKey ? wantKey.split(',') as ContentSection[] : []);

    async function load() {
      setStatus(prev => (prev === 'ready' ? prev : 'loading'));
      await preloadDict(language).catch(() => {});
      if (cancelled) return;

      const today = todayStr();

      // A passage is always either a real AI passage built around due words, or no passage
      // at all — there's no static sample content to fall back to.
      const emptyContent = (): DailyContent => ({
        date: today,
        language,
        hskLevel,
        passages: [],
        fillItems: [],
        conversation: [],
        sections: {},
      });

      const currentDeck = deckRef.current;
      const wordsPerPassageNow = wordsPerPassageRef.current;
      // Shuffle before the priority sort (stable) so words tied on due date don't always
      // land in the same top group — otherwise the same overdue words keep getting bundled
      // into every passage together.
      const dueWords = shuffle(
        currentDeck.filter(w => isReadyNow(w, today)),
      ).sort((a, b) => {
        if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
        return 0;
      });
      const budgetLeft = getSrsSettings().newPerDay - getTodayCounts().newCount;
      const selectedWords = selectTargets(dueWords, wordsPerPassageNow, budgetLeft).words;
      const hasDueWords = selectedWords.length > 0;

      // Restore the FULL cached set of passages — every one the user generated today via
      // "+ new passage" persists across reloads and tab switches (the cache is date-keyed,
      // so a new day still starts fresh). Don't truncate; that's what was erasing extras.
      const cached = await storage.getDailyContent(language, hskLevel);
      if (cancelled) return;
      let base: DailyContent | null = null;
      if (cached) {
        const migrated = migrateContent(cached as unknown as Record<string, unknown>);
        if (migrated) {
          sanitizeCachedContent(migrated, language);
          base = migrated;
        }
      }
      const content = base ?? emptyContent();
      setDailyContent(content);

      const flags = sectionFlags(content);
      // Auto-generate a passage only on the day's first load, and only when there are due
      // words to build it around — never a generic vocab-less passage. On a later HSK-level
      // / deck switch (when other content already exists today), show this scope's cache
      // (or nothing) instead — the user gets a fresh AI passage via "+ new passage".
      /**
       * A PASSAGE IS NEVER GENERATED HERE.
       *
       * It used to be, on the day's first load — so opening the app spent Anthropic tokens on
       * a passage nobody had asked to read, and most opens are not a reading session. The cost
       * landed whether or not the tab was even looked at. `loadMore` is now the only path that
       * writes one, and it runs from the "Generate passage" button.
       *
       * Fill and conversation are still generated on the day's first load: they are cheap
       * relative to a passage, and the Practice tab has no equivalent "generate" affordance to
       * hang them off.
       */
      const alreadyToday = hasAnyDailyContentToday(today);
      const needed: ContentSection[] = [];
      if (wantSet.has('fill')    && hasDueWords && !flags.fill  && !alreadyToday) needed.push('fill');
      if (wantSet.has('convo')   && hasDueWords && !flags.convo && !alreadyToday) needed.push('convo');

      // If a fresh passage is being generated (none cached yet), stay in 'loading' so the
      // user sees the skeleton until the real passage lands. When an AI passage is already
      // cached, show it immediately.
      setStatus(needed.includes('passage') ? 'loading' : 'ready');

      if (needed.length === 0) return;

      setGenerating(new Set(needed));

      for (const section of needed) {
        if (cancelled) break;
        try {
          const res = await fetch('/api/daily-content', {
            method: 'POST',
            headers: aiHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              words: selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m, compounds: w.compounds })),
              hskLevel,
              language,
              sections: [section],
              wordsPerPassage: wordsPerPassageNow,
            }),
          });
          if (cancelled) return;

          if (res.status === 503) {
            setStatus('no-key');
            break;
          }
          if (res.status === 402) {
            markGuestAiExhausted();
            setGuestLimited(true);
            setStatus('ready');
            break;
          }
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
          }

          const payload = await res.json();
          syncGuestAiRemaining((payload as { aiRemaining?: number | null }).aiRemaining);
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
            const passages: DailyPassage[] = rawPassages.map((p: unknown, pi: number) => {
              const passage = buildPassage(
                p as { title: RawTok[]; sentences: RawTok[][]; questions?: unknown[] },
                batches[pi] ?? [],
                buildSet,
                deckReadings,
                language,
              );
              passage.vocabWords = collectVocabWords(passage, dueSet, anchorCompounds);
              return passage;
            });
            // No static-passage fallback here — a malformed/empty AI response is a real
            // failure, surfaced as an error so the user can retry rather than silently
            // getting a generic sample passage.
            if (passages.length === 0 || passages[0].sentences.length < 2) {
              throw new Error('Passage generation returned incomplete content');
            }
            built = passages;
            done = complete?.passage !== false;
          } else if (section === 'fill') {
            const builtFill = data.fill ? buildFillItems(data.fill as unknown[], dueSet, deckReadings, language) : [];
            // No static fallback — a malformed/empty AI response is a real failure, surfaced
            // as an error so the user can retry, matching the passage section above.
            if (builtFill.length < 1) {
              throw new Error('Fill-in-blank generation returned incomplete content');
            }
            built = builtFill;
            done = complete?.fill !== false;
          } else {
            const builtConvo = data.convo ? buildConvo(data.convo as unknown[], dueSet, deckReadings, language) : [];
            if (builtConvo.length < 2) {
              throw new Error('Conversation generation returned incomplete content');
            }
            built = builtConvo;
            done = complete?.convo !== false;
          }

          if (cancelled) return;

          const disk = await storage.getDailyContent(language, hskLevel);
          if (cancelled) return;
          const diskBase = disk ? (migrateContent(disk as unknown as Record<string, unknown>) ?? content) : content;
          const merged = mergeSection(
            { ...diskBase, date: today, language, hskLevel },
            section, built, done,
          );
          await storage.saveDailyContent(merged);
          if (cancelled) return;
          setDailyContent(prev => mergeSection(prev ?? content, section, built, done));
          // Section landed (real or static fallback) — leave the loading skeleton.
          setStatus(prev => (prev === 'loading' ? 'ready' : prev));
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
  }, [hskLevel, wantKey, language]);

  const loadMore = useCallback(async () => {
    if (!dailyContent || loadingMore || hskLevel === 0) return;

    setLoadingMore(true);

    try {
      const today = todayStr();
      const currentDeck = deckRef.current;

      // A due word only counts as "covered" once its cloze blank has actually been graded —
      // merely appearing in an earlier passage's text isn't enough (that passage's blank may
      // still be sitting unanswered). Read each passage's persisted grades to find out which
      // due words were genuinely reviewed today.
      const contentKey = `${dailyContent.date}|${dailyContent.language ?? 'zh'}|${dailyContent.hskLevel}`;
      const passageStates = await Promise.all(
        dailyContent.passages.map((_, idx) => storage.getPassageState(contentKey, idx)),
      );
      const coveredWords = new Set<string>();
      for (const state of passageStates) {
        if (!state) continue;
        for (const entry of Object.values(state)) coveredWords.add(entry.word);
      }
      const dueWords = shuffle(currentDeck.filter(w => isReadyNow(w, today))).sort((a, b) => {
        if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
        return 0;
      });
      const notCovered = (ws: DeckWord[]) => ws.filter(w => !coveredWords.has(w.h));
      // Only target words that are actually due. Never pull in words scheduled for a future
      // day (e.g. ones just added as "due tomorrow") — prefer due words not yet covered today,
      // then top up remaining slots by re-using already-covered due words.
      const fresh = notCovered(dueWords);
      const reused = dueWords.filter(w => coveredWords.has(w.h));
      const pool = [...fresh, ...reused];
      const budgetLeft = getSrsSettings().newPerDay - getTodayCounts().newCount;
      const selectedWords = selectTargets(pool, wordsPerPassageRef.current, budgetLeft).words;
      // Never generate a generic, vocab-less passage — the caller (the "+ New passage"
      // button) is disabled whenever there are no due words, but guard here too.
      if (selectedWords.length === 0) return;

      const res = await fetch('/api/daily-content', {
        method: 'POST',
        headers: aiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          words: selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m, compounds: w.compounds })),
          hskLevel,
          language,
          themeOffset: dailyContent.passages.length,
          sections: ['passage'],
          wordsPerPassage: wordsPerPassageRef.current,
        }),
      });

      if (res.status === 402) { markGuestAiExhausted(); setGuestLimited(true); return; }
      // No key anywhere — neither the learner's nor the server's. Surface it as the no-key
      // state so the tab offers Settings, rather than as a generic failure they cannot act on.
      if (res.status === 503) { setStatus('no-key'); return; }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail ?? errBody.error ?? `HTTP ${res.status}`);
      }

      const payload = await res.json() as { data: Record<string, unknown>; vocabWords: string[]; batches: string[][]; aiRemaining?: number | null };
      syncGuestAiRemaining(payload.aiRemaining);
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
        language,
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
  }, [dailyContent, loadingMore, hskLevel, language]);

  const generateQuestionsForPassage = useCallback(async (passageIdx: number) => {
    const passage = dailyContent?.passages[passageIdx];
    if (!passage || loadingQuestions) return;

    setLoadingQuestions(true);
    setQuestionsError('');
    try {
      const sep = getLanguageConfig(language).scriptIsUnspaced ? '' : ' ';
      const passageText = passage.sentences.map(s => s.plainText).join(sep);
      const vocabWords = deckRef.current.filter(w => passage.vocabWords.includes(w.h));

      const res = await fetch('/api/daily-content', {
        method: 'POST',
        headers: aiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          words: vocabWords.map(w => ({ h: w.h, p: w.p, m: w.m, compounds: w.compounds })),
          hskLevel,
          language,
          sections: ['questions'],
          passageText,
        }),
      });

      if (res.status === 402) { markGuestAiExhausted(); setGuestLimited(true); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
      }
      const payload = await res.json() as { data: { questions?: unknown[] }; aiRemaining?: number | null };
      syncGuestAiRemaining(payload.aiRemaining);
      const raw = Array.isArray(payload.data?.questions) ? payload.data.questions : [];
      // Reads as an explanation, not a stack trace. The model comes back empty when the
      // passage is too thin to ask about; ReadTab hides the button below its own length
      // threshold, so reaching here means it was long enough to try and still did not land.
      if (raw.length === 0) throw new Error('the model had nothing to ask about this passage. Try again, or read a longer one.');

      /**
       * Through buildQuestions, never `as Question[]`.
       *
       * The route answers in the RawTok wire format — `q` is an array of [text, reading,
       * meaning] tuples, not PassageTokens. Casting told TypeScript otherwise and shipped the
       * tuples straight into the renderer, which reads `t.text` off each one and gets
       * undefined: five questions rendered as five empty prompts above five answer boxes.
       * Every other consumer of this payload already goes through the builders; this was the
       * one path that skipped them, which is why questions attached to a generated passage
       * looked fine and lazily-generated ones did not.
       */
      const questions = buildQuestions(
        raw,
        new Set(passage.vocabWords),
        groupReadings(deckRef.current),
        language,
      );

      setDailyContent(prev => {
        if (!prev) return prev;
        const passages = [...prev.passages];
        passages[passageIdx] = { ...passages[passageIdx], questions };
        const updated = { ...prev, passages };
        storage.saveDailyContent(updated);
        return updated;
      });
    } catch (err) {
      // Silence here read as "the button does nothing". A guest whose AI budget is spent, or
      // a malformed generation, got no questions and no reason.
      console.error('[generateQuestionsForPassage]', err);
      setQuestionsError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoadingQuestions(false);
    }
  }, [dailyContent, loadingQuestions, hskLevel, language]);

  /**
   * Append a pasted passage to today's content and persist it.
   *
   * Same append-and-save shape as loadMore, and for the same reason: passages are only ever
   * added to the end, which is what keeps `srsly-cloze|{contentKey}|{idx}` pointing at the
   * passage it was written for. It never touches `sections`, so the day still counts as
   * having no generated passage — pasting must not cost the learner the one the app owes
   * them.
   */
  const addPastedPassage = useCallback((passage: DailyPassage) => {
    setDailyContent(prev => {
      const base: DailyContent = prev ?? {
        date: todayStr(), language, hskLevel,
        passages: [], fillItems: [], conversation: [], sections: {},
      };
      const updated: DailyContent = { ...base, passages: [...base.passages, passage] };
      storage.saveDailyContent(updated);
      return updated;
    });
    // There is content to read now, whatever the generator managed earlier. Never override
    // an in-flight generation's skeleton, though — that one still has a passage coming.
    setStatus(prev => (prev === 'loading' ? prev : 'ready'));
  }, [language, hskLevel]);

  return { dailyContent, status, errorMsg, generating, loadMore, loadingMore, guestLimited, generateQuestionsForPassage, loadingQuestions, questionsError, addPastedPassage };
}
