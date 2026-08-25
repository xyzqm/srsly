import { describe, it, expect } from 'vitest';
import {
  buildLevelIndex, calculateReadability, sampleChapters, MIN_TOKENS, type LevelBands,
} from '@/lib/readability';
import { FR_LEVELS } from '@/lib/data/fr-levels';
import { segmentFr } from '@/lib/server/frenchSegmenter';
import { STARTER_TEXTS } from '@/lib/data/starterTexts';
import type { PassageToken } from '@/lib/types';

/** A token as the segmenter would emit it. */
const w = (text: string, meaning = 'x', baseForm?: string): PassageToken =>
  ({ text, reading: '', meaning, baseForm });
const punct = (text: string): PassageToken => ({ text, type: 'punct' });

const BANDS: LevelBands = { 1: ['chat', 'le'], 2: ['maison'], 3: ['fléau'] };
/** Level numbers easiest → hardest, as LanguageConfig.levels supplies them. */
const ORDER = [1, 2, 3];
const index = buildLevelIndex(BANDS, ORDER);

describe('the level index', () => {
  it('maps every word to its difficulty RANK, counting from 0', () => {
    expect(index.get('chat')).toBe(0);
    expect(index.get('maison')).toBe(1);
    expect(index.get('fléau')).toBe(2);
  });

  it('gives a word listed twice the EASIEST band that claims it', () => {
    const i = buildLevelIndex({ 1: ['a'], 2: ['a'] }, ORDER);
    expect(i.get('a')).toBe(0);
  });

  /**
   * THE BUG THIS RANKING EXISTS FOR. JLPT numbers its levels the other way round — N5 is the
   * beginner level and N1 the advanced one — so comparing raw level numbers scored Japanese
   * exactly backwards: a starter text read "0% at or below JLPT N1" with を and する among its
   * hardest words. `LanguageConfig.levels` is ordered easiest → hardest, so rank fixes it for
   * either direction.
   */
  it('handles a DESCENDING curriculum like JLPT', () => {
    const jlpt: LevelBands = { 5: ['たべる'], 4: ['ふむ'], 1: ['げんぞう'] };
    const order = [5, 4, 3, 2, 1];                       // N5 easiest … N1 hardest
    const i = buildLevelIndex(jlpt, order);
    expect(i.get('たべる'), 'N5 is the easiest band').toBe(0);
    expect(i.get('げんぞう'), 'N1 is the hardest band').toBe(4);

    const toks = [w('たべる'), w('げんぞう')];
    // A learner at N4 knows the N5 word and not the N1 one.
    expect(calculateReadability(toks, i, 4, order).coverage).toBe(0.5);
    // A learner at N1 knows both — this read 0% before ranking.
    expect(calculateReadability(toks, i, 1, order).coverage).toBe(1);
  });
});

describe('coverage', () => {
  it('counts a word at or below the level as known', () => {
    const r = calculateReadability([w('chat'), w('maison')], index, 2, ORDER);
    expect(r.coverage).toBe(1);
  });

  it('counts a word above the level as unknown', () => {
    const r = calculateReadability([w('chat'), w('fléau')], index, 1, ORDER);
    expect(r.coverage).toBe(0.5);
  });

  it('counts a word in no band at all as unknown', () => {
    const r = calculateReadability([w('chat'), w('zzz')], index, 3, ORDER);
    expect(r.coverage).toBe(0.5);
    // -1 is "in no band at all"; rank 0 is the EASIEST band, which is a different thing.
    expect(r.byRank[-1]).toBe(1);
  });

  it('ignores punctuation', () => {
    const r = calculateReadability([w('chat'), punct('.'), punct('!')], index, 1, ORDER);
    expect(r.tokens).toBe(1);
    expect(r.coverage).toBe(1);
  });

  /**
   * TOKEN-WEIGHTED, NOT TYPE-WEIGHTED. By types this text is 50% known; by tokens it is 80%,
   * which is what a reader actually experiences. A rare word met once must not weigh as much
   * as a common one met four times.
   */
  it('weighs every occurrence, not every distinct word', () => {
    const toks = [w('chat'), w('chat'), w('chat'), w('chat'), w('fléau')];
    const r = calculateReadability(toks, index, 1, ORDER);
    expect(r.coverage).toBe(0.8);
    expect(r.types).toBe(2);
    expect(r.tokens).toBe(5);
  });

  it('measures the lemma, not the surface form', () => {
    // `chats` is not in any band; `chat` is. Reading the surface would score this 0%.
    const r = calculateReadability([w('chats', 'cat', 'chat')], index, 1, ORDER);
    expect(r.coverage).toBe(1);
  });

  /**
   * A level the scale does not contain means the learner cannot be placed at all — a prefs and
   * config mismatch. Saying "0% · very hard" would be a confident answer to a question we could
   * not read, so the hook renders nothing instead; see useReadability.
   */
  it('reports nothing known when the level is off the scale', () => {
    expect(calculateReadability([w('chat')], index, 99, ORDER).coverage).toBe(0);
  });

  it('is 0 rather than NaN for an empty text', () => {
    const r = calculateReadability([], index, 1, ORDER);
    expect(r.coverage).toBe(0);
    expect(r.tokens).toBe(0);
  });
});

/**
 * Proper nouns are filtered out of the dictionaries at build time, so a novel's characters
 * resolve to nothing. Counting them as hard words makes every novel look far above its real
 * level; counting them as known would be a lie.
 */
describe('words the dictionary cannot define are not measured', () => {
  it('excludes them from coverage entirely', () => {
    const toks = [w('chat'), w('Meursault', ''), w('Raymond', '')];
    const r = calculateReadability(toks, index, 1, ORDER);
    expect(r.unresolved).toBe(2);
    expect(r.tokens).toBe(1);
    expect(r.coverage).toBe(1);
  });

  it('does not list them among the hardest words', () => {
    const toks = [w('Meursault', ''), w('Meursault', ''), w('fléau')];
    const r = calculateReadability(toks, index, 1, ORDER);
    expect(r.hardest.map(h => h.word)).toEqual(['fléau']);
  });
});

/**
 * `j'aime` is `je` + `aime`, both A1, but it survives segmentation as one token because it is
 * its own dictionary headword — so it is in no band, and grading it put "j'aime" at the top of
 * a beginner chapter's list of hardest words.
 */
describe('an elision the lemmatizer could not split is not graded', () => {
  it('is excluded from coverage rather than counted as hard', () => {
    const r = calculateReadability([w('chat'), w("j'aime", 'I like')], index, 1, ORDER);
    expect(r.unresolved).toBe(1);
    expect(r.tokens).toBe(1);
    expect(r.coverage).toBe(1);
  });

  it('never appears among the hardest words', () => {
    const toks = [w("j'aime", 'I like'), w("j'aime", 'I like'), w('fléau')];
    expect(calculateReadability(toks, index, 1, ORDER).hardest.map(h => h.word)).toEqual(['fléau']);
  });

  it('still counts when the elision IS a graded word', () => {
    const i = buildLevelIndex({ 1: ["aujourd'hui"] }, ORDER);
    const r = calculateReadability([w("aujourd'hui", 'today')], i, 1, ORDER);
    expect(r.tokens).toBe(1);
    expect(r.coverage).toBe(1);
  });
});

describe('the hardest words', () => {
  it('ranks by how often you would hit them', () => {
    const toks = [w('fléau'), w('fléau'), w('zzz'), w('chat')];
    const r = calculateReadability(toks, index, 1, ORDER);
    expect(r.hardest.map(h => h.word)).toEqual(['fléau', 'zzz']);
    expect(r.hardest[0].count).toBe(2);
  });

  it('never includes a word at or below the level', () => {
    const toks = [w('chat'), w('chat'), w('chat'), w('fléau')];
    const r = calculateReadability(toks, index, 3, ORDER);
    expect(r.hardest).toEqual([]);
  });

  it('names at most five', () => {
    const toks = Array.from({ length: 12 }, (_, i) => w(`unknown${i}`));
    expect(calculateReadability(toks, index, 1, ORDER).hardest).toHaveLength(5);
  });
});

describe('sampling a book', () => {
  const chapters = Array.from({ length: 20 }, (_, i) => `chapter ${i} `.repeat(80));

  it('takes excerpts spread through the book, not the opening', () => {
    const s = sampleChapters(chapters, 3);
    expect(s).toHaveLength(3);
    expect(new Set(s).size).toBe(3);
    expect(s[0]).not.toContain('chapter 0 ');   // front matter skipped
  });

  it('caps each excerpt so one request can carry it', () => {
    for (const s of sampleChapters(chapters, 3, 4000)) expect(s.length).toBeLessThanOrEqual(4000);
  });

  it('skips chapters too short to be prose', () => {
    expect(sampleChapters(['Title page', 'Copyright 2026', 'x'], 3)).toEqual([]);
  });

  it('copes with a book of one real chapter', () => {
    expect(sampleChapters(['word '.repeat(200)], 3)).toHaveLength(1);
  });
});

/**
 * Against the REAL level table and the REAL segmenter — the same reasoning as the starter-text
 * tests. The claim is about our data, so a stub would test the arithmetic instead.
 */
describe('a real French text scores sensibly', () => {
  const bands = FR_LEVELS as unknown as LevelBands;
  const FR_ORDER = [1, 2, 3, 4, 5, 6];
  const frIndex = buildLevelIndex(bands, FR_ORDER);
  const starter = STARTER_TEXTS.fr[0];
  const tokens: PassageToken[] = segmentFr(starter.text, new Map()).map(t => ({
    text: t[0], reading: t[1], meaning: t[2], baseForm: t[3],
    type: t.length === 1 ? ('punct' as const) : undefined,
  }));

  it('is long enough to be worth measuring', () => {
    expect(tokens.filter(t => t.type !== 'punct').length).toBeGreaterThan(MIN_TOKENS);
  });

  /**
   * THE REGRESSION THIS GUARDS. Matching raw surface forms against a lemma-keyed table scores
   * a wholly-beginner text at around 40%, because every conjugated verb and plural misses. A
   * starter text is written to be A1-A2, so it has to come out high.
   */
  it('scores an A1 starter text high, not at the ~40% a surface match would give', () => {
    const r = calculateReadability(tokens, frIndex, 2, FR_ORDER);
    expect(r.coverage).toBeGreaterThan(0.85);
  });

  it('gets harder as the level drops', () => {
    const a1 = calculateReadability(tokens, frIndex, 1, FR_ORDER).coverage;
    const c2 = calculateReadability(tokens, frIndex, 6, FR_ORDER).coverage;
    expect(c2).toBeGreaterThanOrEqual(a1);
  });

  it('accounts for every measured token in exactly one band', () => {
    const r = calculateReadability(tokens, frIndex, 2, FR_ORDER);
    expect(Object.values(r.byRank).reduce((a, b) => a + b, 0)).toBe(r.tokens);
  });
});
