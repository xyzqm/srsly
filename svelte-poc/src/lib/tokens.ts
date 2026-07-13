import type { PassageToken, Sentence, LanguageCode } from './types';
import { lookupReading } from './data/lookup';
import { pickReading, type ReadingHint } from './readings';

// Chinese-only port of the token-normalization pipeline in hooks/useDailyContent.ts.
// The server emits bare-hanzi RawTok arrays; here we resolve pinyin/meaning from CC-CEDICT,
// re-merge single characters into real compounds, and split over-grouped runs.

export type RawTok = [string] | [string, string] | [string, string, string] | [string, string, string, string];

const PUNCT_CHARS = new Set([
  '。', '！', '？', '，', '、', '—', '…', '·', '「', '」', '『', '』',
  '“', '”', '‘', '’', '（', '）', '【', '】', '《', '》', '〈', '〉',
  '：', '；', ',', '.', ';', ':', '!', '?', '(', ')', '"', "'", '[', ']', '{', '}',
  '～', '~', '／', '\\', '|', '`', '^',
]);

function isPunct(text: string): boolean {
  if (PUNCT_CHARS.has(text)) return true;
  if (text.length === 1 && !/[一-鿿㐀-䶿]/.test(text) && !/[a-zA-Z0-9]/.test(text)) return true;
  return false;
}

function rawToToken(arr: RawTok, dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode): PassageToken {
  const [text, rawReading, meaning] = arr as [string, string?, string?];
  if (isPunct(text)) return { text, type: 'punct' };
  const reading = rawReading || lookupReading(lang, text).reading || '';
  if (!reading) {
    const isWordLike = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length >= 2;
    return isWordLike ? { text } : { text, type: 'punct' };
  }
  const dictEntry = lookupReading(lang, text, reading, '');
  const resolvedMeaning = meaning || pickReading(deckReadings.get(text), reading)?.m || dictEntry.meaning || '';
  if (dueWords.has(text) || resolvedMeaning) {
    return { text, reading, meaning: resolvedMeaning, type: 'vocab' };
  }
  return { text, reading };
}

const NON_MERGING_PARTICLES = new Set(['的', '了', '着', '地', '吗', '呢', '吧', '啊', '呀', '嘛']);

function mergeCompoundTokens(tokens: PassageToken[], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode): PassageToken[] {
  const result: PassageToken[] = [];
  let i = 0;
  const isSingleCJK = (t: PassageToken | undefined): t is PassageToken =>
    !!t && t.text.length === 1 && t.type !== 'punct' && /[一-鿿]/.test(t.text);

  while (i < tokens.length) {
    const curr = tokens[i];
    const next = tokens[i + 1];
    const next2 = tokens[i + 2];

    if (isSingleCJK(curr) && isSingleCJK(next) && isSingleCJK(next2)
      && !NON_MERGING_PARTICLES.has(next.text) && !NON_MERGING_PARTICLES.has(next2.text)) {
      const tri = curr.text + next.text + next2.text;
      const e3 = lookupReading(lang, tri);
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

function degroupOversized(tokens: PassageToken[], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode): PassageToken[] {
  const exploded: PassageToken[] = [];
  function explodeToken(t: PassageToken) {
    for (const ch of t.text) {
      if (CJK_RE.test(ch)) {
        const entry = lookupReading(lang, ch);
        exploded.push({ text: ch, reading: entry.reading || undefined, meaning: entry.meaning || undefined, type: entry.reading ? 'vocab' : undefined });
      } else {
        exploded.push({ text: ch, type: isPunct(ch) ? 'punct' : undefined });
      }
    }
  }
  for (const t of tokens) {
    const cjkCount = (t.text.match(new RegExp(CJK_RE.source, 'g')) ?? []).length;
    if (t.type === 'punct' || cjkCount <= 1) { exploded.push(t); continue; }
    if (cjkCount >= 5) { explodeToken(t); continue; }
    const entry = lookupReading(lang, t.text);
    if (entry.reading || dueWords.has(t.text) || deckReadings.has(t.text) || t.type === 'vocab') {
      exploded.push(t);
    } else {
      explodeToken(t);
    }
  }
  return mergeCompoundTokens(exploded, dueWords, deckReadings, lang);
}

// Drop empty tokens, the literal string "punctuation", and blank/underscore placeholders the
// model sometimes leaves inside fill before/after text (e.g. "____" or "＿＿") instead of only
// removing the answer word.
function keepTok(r: RawTok): boolean {
  const t = r[0];
  return t !== '' && t !== 'punctuation' && !/^[_＿＿‗﹍-﹏\s]+$/.test(t);
}

export function buildSentences(rawRows: RawTok[][], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode = 'zh'): Sentence[] {
  return rawRows.map((row) => {
    const raw = row.filter(keepTok).map((r) => rawToToken(r, dueWords, deckReadings, lang));
    const tokens = degroupOversized(raw, dueWords, deckReadings, lang);
    return { tokens, plainText: tokens.map((t) => t.text).join('') };
  });
}

export function buildTokens(row: RawTok[], dueWords: Set<string>, deckReadings: Map<string, ReadingHint[]>, lang: LanguageCode = 'zh'): PassageToken[] {
  const raw = row.filter(keepTok).map((r) => rawToToken(r, dueWords, deckReadings, lang));
  return degroupOversized(raw, dueWords, deckReadings, lang);
}
