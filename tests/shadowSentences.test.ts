import { describe, it, expect } from 'vitest';
import practice from '@data/lesson-practice.json';
import { __flattenForTest as flatten, type ShadowSentence } from '@/lib/shadowSentences';
import { LESSON_LANGUAGES } from '@/lib/lessons';

/**
 * The shadowing corpus, checked against the REAL file rather than a fixture.
 *
 * The claims here are about the DATA — that every language the drill offers sentences for
 * actually has some, that none of them is empty or untrimmed, that a gloss is present so the
 * learner is not imitating noise. A fixture would only test the flattener against itself,
 * which is the reason `tests/typedAnswer.test.ts` loads the real dictionaries too.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const file = practice as any;

describe('shadowing sentences come from the lesson corpus', () => {
  it.each(LESSON_LANGUAGES)('%s has phrase-level material', lang => {
    const rows = flatten(file, lang);
    // 69 for zh/ja and 87 for es/fr at the time of writing. Asserted as a FLOOR, because the
    // lesson tree grows and a test that pins the exact count fails on every new lesson.
    expect(rows.length).toBeGreaterThanOrEqual(60);
  });

  it.each(LESSON_LANGUAGES)('%s: every row is speakable and glossed', lang => {
    for (const r of flatten(file, lang) as ShadowSentence[]) {
      // An empty utterance would read as a broken Reference button rather than missing data.
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.text).toBe(r.text.trim());
      // Imitating a sound with no meaning attached is parroting, not studying.
      expect(r.gloss.length).toBeGreaterThan(0);
      expect(r.lesson.startsWith(`${lang}-`)).toBe(true);
    }
  });

  it.each(LESSON_LANGUAGES)('%s: these are PHRASES, which is the whole point', lang => {
    const rows = flatten(file, lang);
    // The drill exists because a single word carries no rhythm. If this corpus were mostly
    // one-word lines it would not be doing the job the words source already does.
    const multi = rows.filter(r => [...r.text].length >= 4).length;
    expect(multi / rows.length).toBeGreaterThan(0.9);
  });

  it('a language with no tree yields an empty list, not a crash', () => {
    // `[]` is a real answer and the caller renders it differently from "not loaded yet".
    expect(flatten(file, 'ko' as never)).toEqual([]);
  });

  it('drops a row with no text rather than queueing an unspeakable item', () => {
    const stub = { zh: { 'zh-x': [
      { text: '好。', gloss: 'Good.', tiles: [] },
      { text: '   ', gloss: 'blank', tiles: [] },
      { text: '', gloss: 'empty', tiles: [] },
    ] } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = flatten(stub as any, 'zh');
    expect(rows.map(r => r.text)).toEqual(['好。']);
  });
});
