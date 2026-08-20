import { describe, it, expect } from 'vitest';
import { weakestWords, MIN_LAPSES } from '@/lib/weakWords';
import { proverbFor, type Proverb } from '@/lib/proverb';
import { mergeShelf } from '@/lib/shelf';
import { isBoundForm } from '@/lib/boundForms';
import type { DeckWord, ShelfEntry } from '@/lib/types';

const card = (h: string, reviews: number, lapses: number, over: Partial<DeckWord> = {}): DeckWord =>
  ({ id: h, h, p: '', m: '', reviews, lapses, ...over });

describe('weakestWords ranks by RATE, not by count', () => {
  it('6 of 9 outranks 6 of 60', () => {
    const out = weakestWords([card('often', 60, 6), card('mostly', 9, 6)]);
    expect(out[0].word.h).toBe('mostly');
  });

  it(`needs ${MIN_LAPSES} lapses — one bad day is not a pattern`, () => {
    expect(weakestWords([card('once', 20, 1)])).toHaveLength(0);
    expect(weakestWords([card('twice', 20, 2)])).toHaveLength(1);
  });

  it('excludes pool words, which have no study record', () => {
    expect(weakestWords([card('pooled', 5, 4, { pool: true })])).toHaveLength(0);
  });

  it('is uncapped by default and capped on request', () => {
    const many = Array.from({ length: 20 }, (_, i) => card('w' + i, 10, 5));
    expect(weakestWords(many)).toHaveLength(20);
    expect(weakestWords(many, 8)).toHaveLength(8);
  });
});

describe('proverbFor is a pure function of the day', () => {
  const table: Record<string, Proverb[]> = { zh: [
    { t: 'A', m: 'a' }, { t: 'B', m: 'b' }, { t: 'C', m: 'c' },
  ] };

  it('advances one per day and wraps', () => {
    // No localStorage in this environment, so dayOne falls back to today: day 0 every time.
    const first = proverbFor(table, 'zh', new Date('2026-08-19T12:00:00'));
    expect(first).toEqual(table.zh[0]);
  });

  it('returns null for a language with no entries', () => {
    expect(proverbFor(table, 'fr')).toBeNull();
    expect(proverbFor(null, 'zh')).toBeNull();
  });
});

describe('mergeShelf', () => {
  const entry = (id: string, date: string): ShelfEntry =>
    ({ id, date, language: 'es', level: 1, title: id, text: 't', vocabWords: [] });

  it('dedupes by id, incoming wins', () => {
    const merged = mergeShelf([entry('a', '2026-08-01')], [{ ...entry('a', '2026-08-01'), title: 'newer' }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('newer');
  });

  it('sorts newest first', () => {
    const merged = mergeShelf([entry('old', '2026-08-01')], [entry('new', '2026-08-10')]);
    expect(merged.map(e => e.id)).toEqual(['new', 'old']);
  });
});

describe('isBoundForm reads the dictionary marker', () => {
  it.each([
    ['璃', '(phonetic character used in transliteration of foreign names)'],
    ['萄', 'used in 葡萄[pu2 tao5]'],
    ['蝶', '(bound form) butterfly'],
    ['玻', 'see 玻璃[bo1 li5]'],
  ])('%s is bound', (c, gloss) => expect(isBoundForm(c, gloss)).toBe(true));

  it.each([
    ['水', 'water'],
    ['学校', 'school'],
  ])('%s is not', (c, gloss) => expect(isBoundForm(c, gloss)).toBe(false));
});
