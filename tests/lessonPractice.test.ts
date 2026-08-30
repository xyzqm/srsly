import { describe, it, expect } from 'vitest';
import {
  buildQuestions, isCorrect, bareWord, MIN_ORDER_TILES, CHOICE_OPTIONS,
  promptFor,
} from '@/lib/lessonPractice';
import { lessonsFor } from '@/lib/data/lessons';
import { grammarLessons, LESSON_LANGUAGES } from '@/lib/lessons';
import type { Lesson } from '@/lib/lessons';
import type { LanguageCode } from '@/lib/types';

/** A fixed generator, so a shuffle cannot make a test flaky. */
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const lesson = (examples: { text: string; gloss: string; tiles: string[] }[]): Lesson =>
  ({ id: 'test', kind: 'grammar', title: 't', summary: 's', explanation: 'e', examples });

describe('trailing punctuation is not part of the word', () => {
  it('strips the mark the last tile carries', () => {
    expect(bareWord('吃饭。')).toBe('吃饭');
    expect(bareWord('rue.')).toBe('rue');
    expect(bareWord('か。')).toBe('か');
  });
  it('leaves a word that has none alone', () => {
    expect(bareWord('我')).toBe('我');
  });
});

describe('short sentences become choice questions', () => {
  /**
   * THE BUG THIS EXISTS FOR. With the full stop pinned to the last tile, a two-tile ordering
   * question has exactly one sensible arrangement — it solves itself and asks nothing.
   */
  it('does not ask you to order two tiles', () => {
    const qs = buildQuestions(lesson([
      { text: '我吃饭。', gloss: 'I eat.', tiles: ['我', '吃饭。'] },
    ]), seeded(1));
    expect(qs).toHaveLength(1);
    expect(qs[0].kind).toBe('choice');
  });

  it('still orders a sentence long enough to be worth ordering', () => {
    const qs = buildQuestions(lesson([
      { text: '我今天买书。', gloss: 'I buy a book today.', tiles: ['我', '今天', '买', '书。'] },
    ]), seeded(2));
    expect(qs[0].kind).toBe('order');
  });

  it('never blanks the tile carrying the punctuation', () => {
    for (let s = 1; s < 40; s++) {
      const qs = buildQuestions(lesson([
        { text: '我吃饭。', gloss: 'I eat.', tiles: ['我', '吃饭。'] },
      ]), seeded(s));
      const q = qs[0];
      if (q.kind !== 'choice') continue;
      expect(q.blankIndex, 'the punctuated final tile must never be the gap')
        .toBeLessThan(q.tiles.length - 1);
    }
  });

  it('offers the answer among its options, and no duplicates', () => {
    const qs = buildQuestions(lesson([
      { text: '我吃饭。', gloss: 'I eat.', tiles: ['我', '吃饭。'] },
      { text: '他喝茶。', gloss: 'He drinks tea.', tiles: ['他', '喝茶。'] },
      { text: '她要茶。', gloss: 'She wants tea.', tiles: ['她', '要茶。'] },
    ]), seeded(7));
    for (const q of qs) {
      if (q.kind !== 'choice') continue;
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.options.length).toBeLessThanOrEqual(CHOICE_OPTIONS);
    }
  });

  /** A distractor carrying a full stop would be identifiable without reading it. */
  it('draws distractors as bare words, not punctuated ones', () => {
    const qs = buildQuestions(lesson([
      { text: '我吃饭。', gloss: 'I eat.', tiles: ['我', '吃饭。'] },
      { text: '他喝茶。', gloss: 'He drinks tea.', tiles: ['他', '喝茶。'] },
    ]), seeded(11));
    for (const q of qs) {
      if (q.kind !== 'choice') continue;
      for (const o of q.options) expect(o).toBe(bareWord(o));
    }
  });
});

describe('the pool is not the answer', () => {
  /**
   * THE BUG THIS EXISTS FOR, found by opening the app rather than by reading the code.
   *
   * The pool was rendered straight from `tiles`, which is the CORRECT order — so every
   * build-the-sentence question presented its own answer left to right, and could be solved by
   * tapping along the row without reading a word of it. Nothing in the suite noticed, because
   * every assertion was about which tiles exist rather than what order they are shown in.
   */
  it('never opens a question with the sentence already in order', () => {
    for (let seed = 1; seed < 60; seed++) {
      const qs = buildQuestions(lesson([
        { text: '我今天买书。', gloss: 'I buy a book today.', tiles: ['我', '今天', '买', '书。'] },
      ]), seeded(seed));
      const q = qs[0];
      if (q.kind !== 'order') continue;
      expect(q.shuffled, `seed ${seed} showed the answer`).not.toEqual(q.tiles);
    }
  });

  it('shows exactly the tiles of the answer, just rearranged', () => {
    const qs = buildQuestions(lesson([
      { text: '我今天买书。', gloss: 'I buy a book today.', tiles: ['我', '今天', '买', '书。'] },
    ]), seeded(3));
    const q = qs[0];
    if (q.kind !== 'order') throw new Error('expected an ordering question');
    expect([...q.shuffled].sort()).toEqual([...q.tiles].sort());
  });

  /**
   * A sentence whose tiles are all the same word has no arrangement that differs from the
   * answer, so the reshuffle must give up rather than spin. It cannot happen in the authored
   * data, and a loop that depends on that is a loop waiting for the data to change.
   */
  it('gives up rather than looping when no other order exists', () => {
    const qs = buildQuestions(lesson([
      { text: '好好好', gloss: 'ok', tiles: ['好', '好', '好'] },
    ]), seeded(3));
    expect(qs[0].kind).toBe('order');
  });

  it('every real ordering question shows a different order from its answer', () => {
    for (const lang of LESSON_LANGUAGES as LanguageCode[]) {
      for (const l of grammarLessons(lessonsFor(lang))) {
        for (const q of buildQuestions(l, seeded(13))) {
          if (q.kind !== 'order') continue;
          expect(q.shuffled, `${l.id}: «${q.example.text}» is shown already solved`)
            .not.toEqual(q.tiles);
        }
      }
    }
  });
});

describe('answers are checked against the right thing', () => {
  const qs = buildQuestions(lesson([
    { text: '我今天买书。', gloss: 'I buy a book today.', tiles: ['我', '今天', '买', '书。'] },
  ]), seeded(3));

  it('accepts the authored order and rejects any other', () => {
    const q = qs[0];
    expect(isCorrect(q, ['我', '今天', '买', '书。'])).toBe(true);
    expect(isCorrect(q, ['今天', '我', '买', '书。'])).toBe(false);
    expect(isCorrect(q, ['我', '今天', '买'])).toBe(false);
  });
});

describe('every real lesson can build a session', () => {
  for (const lang of LESSON_LANGUAGES as LanguageCode[]) {
    it(`${lang}: every grammar lesson yields at least one question`, () => {
      for (const l of grammarLessons(lessonsFor(lang))) {
        const qs = buildQuestions(l, seeded(5));
        expect(qs.length, `${l.id} produced no practice`).toBeGreaterThan(0);
        for (const q of qs) {
          if (q.kind === 'order') {
            expect(q.tiles.length, `${l.id} ordering fewer than ${MIN_ORDER_TILES}`)
              .toBeGreaterThanOrEqual(MIN_ORDER_TILES);
          } else {
            expect(q.options).toContain(q.answer);
          }
        }
      }
    });
  }
});

describe('the prompt does not contain the answer', () => {
  /**
   * 139 of the 333 authored glosses carry a teaching aside after an em dash, and it usually
   * names the very word being tested — "This sheet of paper is big — 张 for flat things" was
   * the prompt for the question whose answer is 张.
   */
  it('drops the teaching aside from the prompt', () => {
    const qs = buildQuestions(lesson([
      { text: '这张纸很大。', gloss: 'This sheet of paper is big — 张 for flat things.',
        tiles: ['这', '张', '纸', '很', '大。'] },
    ]), seeded(4));
    expect(promptFor(qs[0])).toBe('This sheet of paper is big');
    expect(promptFor(qs[0])).not.toContain('张');
  });

  it('leaves a gloss with no aside untouched', () => {
    const qs = buildQuestions(lesson([
      { text: '我今天买书。', gloss: 'I buy a book today.', tiles: ['我', '今天', '买', '书。'] },
    ]), seeded(5));
    expect(promptFor(qs[0])).toBe('I buy a book today.');
  });

  /**
   * Across every real lesson: no prompt may name the word it is asking for.
   *
   * SCRIPT-AWARE, because a naive substring check is wrong for Latin scripts — the Spanish
   * answer `no` appears inside the English prompt "I do NOt understand", which is a
   * coincidence and not a leak. CJK has no word boundaries, so substring is right there;
   * Latin needs `\b`.
   */
  it('never names the answer in any real prompt', () => {
    const cjk = /[\u3040-\u30ff\u3400-\u9fff]/;
    for (const lang of LESSON_LANGUAGES as LanguageCode[]) {
      for (const l of grammarLessons(lessonsFor(lang))) {
        for (const q of buildQuestions(l, seeded(9))) {
          if (q.kind !== 'choice') continue;
          const prompt = promptFor(q);
          const leaked = cjk.test(q.answer)
            ? prompt.includes(q.answer)
            : new RegExp(`\\b${q.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(prompt);
          expect(leaked, `${l.id}: prompt "${prompt}" names its answer "${q.answer}"`).toBe(false);
        }
      }
    }
  });
});
