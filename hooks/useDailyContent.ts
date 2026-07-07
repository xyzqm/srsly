'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { PassageToken, Sentence, FillItem, ConvoTurn, Question, MCOption, DailyContent, DailyPassage, DeckWord, ContentSection, LanguageCode } from '@/lib/types';
import { storage } from '@/lib/storage';
import { getPassageDataForLanguage } from '@/lib/data/allPassages';
import { lookupReading, preloadDict, deinflectWord } from '@/lib/data/lookup';
import { groupReadings, pickReading, type ReadingHint } from '@/lib/readings';
import { buildAnchorMap } from '@/lib/anchors';
import { isDueToday, inSelectedDecks, decksSignature, todayStr, shuffle } from '@/lib/deck';
import { syncGuestAiRemaining, markGuestAiExhausted } from '@/lib/aiBudget';

type RawTok = [string] | [string, string] | [string, string, string];

const PUNCT_CHARS = new Set([
  '。','！','？','，','、','—','…','·','「','」','『','』',
  '\u201c','\u201d','\u2018','\u2019','（','）','【','】','《','》','〈','〉',
  '：','；',',','.',';',':','!','?','(',')','"',"'",'[',']','{','}',
  '–','○','●','□','■','◇','◆','△','▲','▽','▼','★','☆','•','‥',
  '～','~','／','\\','|','`','^',
]);

function isPunct(text: string): boolean {
  if (PUNCT_CHARS.has(text)) return true;
  if (text.length === 1 && !/[一-鿿㐀-䶿豈-﫿＀-￯぀-ゟ゠-ヿ]/.test(text) && !/[a-zA-Z0-9]/.test(text)) return true;
  return false;
}

function rawToToken(arr: RawTok, dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode): PassageToken {
  const [text, rawReading, meaning] = arr as [string, string?, string?];
  if (isPunct(text)) return { text, type: 'punct' };
  const reading = rawReading || lookupReading(lang, text).reading || '';
  if (!reading) {
    // No reading resolved. For Chinese a 2+ Han-char run is still a word; for Japanese
    // (where the AI segments + annotates) any multi-char run is treated as a word too.
    const isWordLike = lang === 'ja' ? text.length >= 2 : (text.match(/[一-鿿㐀-䶿]/g) ?? []).length >= 2;
    return isWordLike ? { text } : { text, type: 'punct' };
  }
  const dictEntry = lookupReading(lang, text, reading, '');
  const resolvedMeaning = meaning || pickReading(deckReadings.get(text), reading)?.m || dictEntry.meaning || '';
  if (dueWords.has(text) || resolvedMeaning) {
    // Japanese: check if this is a conjugated form of a due vocab word so cloze blanks
    // and grade attribution use the correct base-form card.
    if (lang === 'ja' && !dueWords.has(text)) {
      const baseForm = deinflectWord(lang, text).find(c => dueWords.has(c));
      if (baseForm) return { text, reading, meaning: resolvedMeaning, type: 'vocab', baseForm };
    }
    return { text, reading, meaning: resolvedMeaning, type: 'vocab' };
  }
  return { text, reading };
}

// Structural / aspect / modal particles that are almost always standalone grammar words.
// We refuse to absorb them into a compound during the greedy single-char merge below, so
// e.g. 中 + 的 (zhōng + particle) doesn't collapse into the rare word 中的 (zhòngdì, "to hit
// the target"). Real words ending in these (目的, 觉得, …) arrive whole from the model and
// never reach this single-char merge path.
const NON_MERGING_PARTICLES = new Set(['的', '了', '着', '地', '吗', '呢', '吧', '啊', '呀', '嘛']);

// Greedy single-character compound merge — a Chinese-only concern (the model emits bare
// hanzi that may form compounds). Japanese arrives pre-segmented from the AI, so this is a
// no-op there.
function mergeCompoundTokens(
  tokens: PassageToken[],
  dueWords: Set<string>,
  deckReadings: Map<string, ReadingHint[]>,
  lang: LanguageCode,
): PassageToken[] {
  if (lang === 'ja') return tokens;
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
// This whole dance exists because the Chinese model emits bare hanzi; Japanese tokens come
// from the AI already correctly segmented with furigana, so we pass them through untouched.
function degroupOversized(
  tokens: PassageToken[],
  dueWords: Set<string>,
  deckReadings: Map<string, ReadingHint[]>,
  lang: LanguageCode,
): PassageToken[] {
  if (lang === 'ja') return tokens;
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
    return { tokens, plainText: tokens.map(t => t.text).join('') };
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
  rawPassage: { title: RawTok[]; sentences: RawTok[][]; questions?: unknown[] },
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
      s.plainText = s.tokens.map(t => t.text).join('');
    });
    p.questions?.forEach(q => {
      q.q = fixAndDegroup(q.q);
      q.options.forEach(opt => { opt.tokens = fixAndDegroup(opt.tokens); });
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

const MAX_WORDS = 5;
const ALL_SECTIONS: ContentSection[] = ['passage', 'fill', 'convo'];

/**
 * True if any daily content is already cached for `today` (across every level/deck scope).
 * Lets us tell the day's first load (auto-generate the passage) apart from a later HSK-level
 * or deck switch (don't auto-generate — just show that scope's cache or the static fallback,
 * so changing a setting never silently burns a generation or wipes the view).
 */
function hasAnyDailyContentToday(today: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('srsly-daily-') && k.endsWith(today)) return true;
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

export function useDailyContent(
  hskLevel: number,
  deck: DeckWord[],
  studyDecks: string[] | null = null,
  want: ContentSection[] = ALL_SECTIONS,
  language: LanguageCode = 'zh',
): UseDailyContentResult {
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [status, setStatus] = useState<DailyContentStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [generating, setGenerating] = useState<Set<ContentSection>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [guestLimited, setGuestLimited] = useState(false);

  const deckRef = useRef(deck);
  deckRef.current = deck;
  // Stable string key for the selected decks — used for the cache scope and as an effect
  // dep (the array itself changes identity every render). A ref lets callbacks read the
  // latest selection without re-subscribing.
  const deckKey = decksSignature(studyDecks);
  const studyDecksRef = useRef(studyDecks);
  studyDecksRef.current = studyDecks;

  const wantKey = [...want].sort().join(',');

  useEffect(() => {
    if (hskLevel === 0) return;

    let cancelled = false;
    const wantSet = new Set(wantKey ? wantKey.split(',') as ContentSection[] : []);

    async function load() {
      setStatus(prev => (prev === 'ready' ? prev : 'loading'));
      await preloadDict(language).catch(() => {});
      if (cancelled) return;

      const passageData = getPassageDataForLanguage(language, hskLevel);
      const today = todayStr();

      const staticContent = (): DailyContent => ({
        date: today,
        language,
        hskLevel,
        deck: deckKey || undefined,
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

      const currentDeck = deckRef.current;
      // Shuffle before the priority sort (stable) so words tied on due date don't always
      // land in the same top-MAX_WORDS group — otherwise the same overdue words keep
      // getting bundled into every passage together.
      const dueWords = shuffle(
        currentDeck.filter(w => isDueToday(w, today) && inSelectedDecks(w, studyDecksRef.current)),
      ).sort((a, b) => {
        if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
        return 0;
      });
      const selectedWords = dueWords.slice(0, MAX_WORDS);
      const hasDueWords = selectedWords.length > 0;

      // Restore the FULL cached set of passages — every one the user generated today via
      // "+ new passage" persists across reloads and tab switches (the cache is date-keyed,
      // so a new day still starts fresh). Don't truncate; that's what was erasing extras.
      const cached = await storage.getDailyContent(language, hskLevel, deckKey);
      if (cancelled) return;
      let base: DailyContent | null = null;
      if (cached) {
        const migrated = migrateContent(cached as unknown as Record<string, unknown>);
        if (migrated) {
          sanitizeCachedContent(migrated, language);
          base = migrated;
        }
      }
      const content = base ?? staticContent();
      setDailyContent(content);

      const flags = sectionFlags(content);
      // Auto-generate a passage only on the day's first load. On a later HSK-level / deck
      // switch (when other content already exists today), show this scope's cache or the
      // static fallback instead — the user gets a fresh AI passage via "+ new passage".
      const firstLoadToday = !hasAnyDailyContentToday(today);
      const needed: ContentSection[] = [];
      if (wantSet.has('passage') && !flags.passage && firstLoadToday) needed.push('passage');
      if (wantSet.has('fill')    && hasDueWords && !flags.fill)  needed.push('fill');
      if (wantSet.has('convo')   && hasDueWords && !flags.convo) needed.push('convo');

      // If a fresh passage is being generated (none cached yet), stay in 'loading' so the
      // user sees the skeleton — not the static fallback wearing an "✦ AI" badge — until
      // the real passage lands. When an AI passage is already cached, show it immediately.
      setStatus(needed.includes('passage') ? 'loading' : 'ready');

      if (needed.length === 0) return;

      setGenerating(new Set(needed));

      for (const section of needed) {
        if (cancelled) break;
        try {
          const res = await fetch('/api/daily-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              words: selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m, compounds: w.compounds })),
              hskLevel,
              language,
              sections: [section],
            }),
          });
          if (cancelled) return;

          if (res.status === 503) { setStatus('no-key'); break; }
          if (res.status === 402) {
            markGuestAiExhausted();
            setGuestLimited(true);
            setStatus('ready'); // guest over budget — show the static fallback we already have
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
            let passages: DailyPassage[] = rawPassages.map((p: unknown, pi: number) => {
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
            const fellBack = passages.length === 0 || passages[0].sentences.length < 2;
            if (fellBack) passages = staticContent().passages;
            built = passages;
            done = !fellBack && complete?.passage !== false;
          } else if (section === 'fill') {
            const builtFill = data.fill ? buildFillItems(data.fill as unknown[], dueSet, deckReadings, language) : [];
            const fellBack = builtFill.length < 1;
            built = fellBack ? passageData.fillItems : builtFill;
            done = !fellBack && complete?.fill !== false;
          } else {
            const builtConvo = data.convo ? buildConvo(data.convo as unknown[], dueSet, deckReadings, language) : [];
            const fellBack = builtConvo.length < 2;
            built = fellBack ? passageData.conversation : builtConvo;
            done = !fellBack && complete?.convo !== false;
          }

          if (cancelled) return;

          const disk = await storage.getDailyContent(language, hskLevel, deckKey);
          if (cancelled) return;
          const diskBase = disk ? (migrateContent(disk as unknown as Record<string, unknown>) ?? content) : content;
          const merged = mergeSection(
            { ...diskBase, date: today, language, hskLevel, deck: deckKey || undefined },
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
  }, [hskLevel, deckKey, wantKey, language]);

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
      const contentKey = `${dailyContent.date}|${dailyContent.hskLevel}|${dailyContent.deck ?? ''}`;
      const passageStates = await Promise.all(
        dailyContent.passages.map((_, idx) => storage.getPassageState(contentKey, idx)),
      );
      const coveredWords = new Set<string>();
      for (const state of passageStates) {
        if (!state) continue;
        for (const entry of Object.values(state)) coveredWords.add(entry.word);
      }
      const inScope = currentDeck.filter(w => inSelectedDecks(w, studyDecksRef.current));
      const dueWords = shuffle(inScope.filter(w => isDueToday(w, today))).sort((a, b) => {
        if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
        return 0;
      });
      const notCovered = (ws: DeckWord[]) => ws.filter(w => !coveredWords.has(w.h));
      // Only target words that are actually due. Never pull in words scheduled for a future
      // day (e.g. ones just added as "due tomorrow") — prefer due words not yet covered today,
      // then top up remaining slots by re-using already-covered due words; if nothing is due,
      // generate a generic passage (no forced vocab).
      const fresh = notCovered(dueWords);
      const reused = dueWords.filter(w => coveredWords.has(w.h));
      const pool = [...fresh, ...reused];
      const selectedWords = pool.slice(0, MAX_WORDS);

      const res = await fetch('/api/daily-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m, compounds: w.compounds })),
          hskLevel,
          language,
          themeOffset: dailyContent.passages.length,
          sections: ['passage'],
        }),
      });

      if (res.status === 402) { markGuestAiExhausted(); setGuestLimited(true); return; }
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
    try {
      const passageText = passage.sentences.map(s => s.plainText).join('');
      const vocabWords = deckRef.current.filter(w => passage.vocabWords.includes(w.h));

      const res = await fetch('/api/daily-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: vocabWords.map(w => ({ h: w.h, p: w.p, m: w.m, compounds: w.compounds })),
          hskLevel,
          language,
          sections: ['questions'],
          passageText,
        }),
      });

      if (!res.ok) return;
      const payload = await res.json() as { data: { questions?: unknown[] } };
      const questions = Array.isArray(payload.data?.questions) ? payload.data.questions : [];
      if (questions.length === 0) return;

      setDailyContent(prev => {
        if (!prev) return prev;
        const passages = [...prev.passages];
        passages[passageIdx] = { ...passages[passageIdx], questions: questions as import('@/lib/types').Question[] };
        const updated = { ...prev, passages };
        storage.saveDailyContent(updated);
        return updated;
      });
    } catch (err) {
      console.error('[generateQuestionsForPassage]', err);
    } finally {
      setLoadingQuestions(false);
    }
  }, [dailyContent, loadingQuestions, hskLevel, language]);

  return { dailyContent, status, errorMsg, generating, loadMore, loadingMore, guestLimited, generateQuestionsForPassage, loadingQuestions };
}
