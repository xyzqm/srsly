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
const index = buildLevelIndex(BANDS);

describe('the level index', () => {
  it('maps every word to its band', () => {
    expect(index.get('chat')).toBe(1);
    expect(index.get('maison')).toBe(2);
    expect(index.get('fléau')).toBe(3);
  });

  it('gives a word listed twice the EASIEST band that claims it', () => {
    const i = buildLevelIndex({ 1: ['a'], 2: ['a'] });
    expect(i.get('a')).toBe(1);
  });
});

describe('coverage', () => {
  it('counts a word at or below the level as known', () => {
    const r = calculateReadability([w('chat'), w('maison')], index, 2);
    expect(r.coverage).toBe(1);
  });

  it('counts a word above the level as unknown', () => {
    const r = calculateReadability([w('chat'), w('fléau')], index, 1);
    expect(r.coverage).toBe(0.5);
  });

  it('counts a word in no band at all as unknown', () => {
    const r = calculateReadability([w('chat'), w('zzz')], index, 6);
    expect(r.coverage).toBe(0.5);
    expect(r.byLevel[0]).toBe(1);
  });

  it('ignores punctuation', () => {
    const r = calculateReadability([w('chat'), punct('.'), punct('!')], index, 1);
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
    const r = calculateReadability(toks, index, 1);
    expect(r.coverage).toBe(0.8);
    expect(r.types).toBe(2);
    expect(r.tokens).toBe(5);
  });

  it('measures the lemma, not the surface form', () => {
    // `chats` is not in any band; `chat` is. Reading the surface would score this 0%.
    const r = calculateReadability([w('chats', 'cat', 'chat')], index, 1);
    expect(r.coverage).toBe(1);
  });

  it('is 0 rather than NaN for an empty text', () => {
    const r = calculateReadability([], index, 1);
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
    const r = calculateReadability(toks, index, 1);
    expect(r.unresolved).toBe(2);
    expect(r.tokens).toBe(1);
    expect(r.coverage).toBe(1);
  });

  it('does not list them among the hardest words', () => {
    const toks = [w('Meursault', ''), w('Meursault', ''), w('fléau')];
    const r = calculateReadability(toks, index, 1);
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
    const r = calculateReadability([w('chat'), w("j'aime", 'I like')], index, 1);
    expect(r.unresolved).toBe(1);
    expect(r.tokens).toBe(1);
    expect(r.coverage).toBe(1);
  });

  it('never appears among the hardest words', () => {
    const toks = [w("j'aime", 'I like'), w("j'aime", 'I like'), w('fléau')];
    expect(calculateReadability(toks, index, 1).hardest.map(h => h.word)).toEqual(['fléau']);
  });

  it('still counts when the elision IS a graded word', () => {
    const i = buildLevelIndex({ 1: ["aujourd'hui"] });
    const r = calculateReadability([w("aujourd'hui", 'today')], i, 1);
    expect(r.tokens).toBe(1);
    expect(r.coverage).toBe(1);
  });
});

describe('the hardest words', () => {
  it('ranks by how often you would hit them', () => {
    const toks = [w('fléau'), w('fléau'), w('zzz'), w('chat')];
    const r = calculateReadability(toks, index, 1);
    expect(r.hardest.map(h => h.word)).toEqual(['fléau', 'zzz']);
    expect(r.hardest[0].count).toBe(2);
  });

  it('never includes a word at or below the level', () => {
    const toks = [w('chat'), w('chat'), w('chat'), w('fléau')];
    const r = calculateReadability(toks, index, 3);
    expect(r.hardest).toEqual([]);
  });

  it('names at most five', () => {
    const toks = Array.from({ length: 12 }, (_, i) => w(`unknown${i}`));
    expect(calculateReadability(toks, index, 1).hardest).toHaveLength(5);
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
  const frIndex = buildLevelIndex(bands);
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
    const r = calculateReadability(tokens, frIndex, 2);
    expect(r.coverage).toBeGreaterThan(0.85);
  });

  it('gets harder as the level drops', () => {
    const a1 = calculateReadability(tokens, frIndex, 1).coverage;
    const c2 = calculateReadability(tokens, frIndex, 6).coverage;
    expect(c2).toBeGreaterThanOrEqual(a1);
  });

  it('accounts for every measured token in exactly one band', () => {
    const r = calculateReadability(tokens, frIndex, 2);
    expect(Object.values(r.byLevel).reduce((a, b) => a + b, 0)).toBe(r.tokens);
  });
});
