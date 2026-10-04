import { describe, it, expect } from 'vitest';
import { ownEntry, countWords, lengthOf, mergeShelf, removeEntry, withoutRemoved } from '@/lib/shelf';
import { yearInReading } from '@/lib/yearInReading';
import { MAX_ENTRIES } from '@/lib/shelf';
import type { ShelfEntry } from '@/lib/types';

/**
 * READING THE LEARNER BROUGHT HAS TO COUNT, WITHOUT THE SHELF LEARNING ANYTHING IT MAY NOT KEEP.
 *
 * The shelf only ever recorded what the app could SEE finished, and finishing writes
 * `srsly-done`, which only a generated passage has a button to write. So every pasted article,
 * web clip, shared link and book chapter was absent from the shelf and counted zero in the year
 * page — in an app whose whole argument is that you read what you actually want to read.
 *
 * The constraint is the interesting half: the shelf SYNCS, so it may not carry somebody else's
 * prose. An own entry is therefore a citation — what, when, which language, how long.
 */

const prose = 'Ayer fui al mercado con mi hermana y compramos manzanas.';

const es = (over: Partial<Parameters<typeof ownEntry>[0]> = {}) => ownEntry({
  date: '2026-09-20', language: 'es', level: 1, title: 'Un día en el mercado',
  plainText: prose, scriptIsUnspaced: false, ...over,
});

describe('an own entry is a citation, not a copy', () => {
  /** THE PRIVACY INVARIANT. If this ever fails, the shelf has started syncing other people's
   *  writing — the thing "EPUB files never sync" and the paste panel both promise it will not. */
  it('carries no text and no tokens', () => {
    const e = es();
    expect(e.text).toBe('');
    expect(e.sentences).toBeUndefined();
    expect(e.vocabWords).toEqual([]);
    expect(JSON.stringify(e)).not.toContain('mercado con mi hermana');
  });

  /** THE CONTROL: it did read the prose — it just kept the measurement rather than the words. */
  it('still knows how long it was', () => {
    expect(es().words).toBe(countWords(prose, false));
    expect(es().words).toBeGreaterThan(5);
  });

  it('keeps the title, which is a reference to a work and not the work', () => {
    expect(es().title).toBe('Un día en el mercado');
    expect(es({ title: '   ' }).title).toBe('Untitled');
  });

  it('marks itself as own so the shelf knows not to look for a body', () => {
    expect(es().kind).toBe('own');
  });
});

describe('one counting rule, so the two kinds cannot disagree', () => {
  it('measures an own entry by its stored count and a generated one by its text', () => {
    const own = es();
    const generated: ShelfEntry = {
      id: 'g', date: '2026-09-20', language: 'es', level: 1, title: 't',
      text: prose, vocabWords: [],
    };
    expect(lengthOf(own, false)).toBe(lengthOf(generated, false));
  });

  it('counts characters for an unspaced script and words for a spaced one', () => {
    expect(countWords('uno dos tres', false)).toBe(3);
    expect(countWords('我今天很好', true)).toBe(5);
    expect(es({ plainText: '我今天很好', scriptIsUnspaced: true }).words).toBe(5);
  });
});

describe('marking the same reading twice replaces rather than duplicates', () => {
  /**
   * The id is built from the day, language, title and length rather than from a passage index,
   * because an index shifts as passages are added and a shifting id turns a re-mark into a
   * second row.
   */
  it('gives the same id for the same reading', () => {
    expect(es().id).toBe(es().id);
  });

  it('merges to one entry, not two', () => {
    expect(mergeShelf([es()], [es()])).toHaveLength(1);
  });

  it('gives a different id to different reading — the control', () => {
    expect(es({ title: 'Otro artículo' }).id).not.toBe(es().id);
    expect(es({ plainText: prose + ' Y más texto aquí.' }).id).not.toBe(es().id);
  });
});

describe('and now it reaches the year page', () => {
  /** THE WHOLE POINT. Before this, a year of nothing but books and articles read as a year of
   *  no reading at all. */
  it('counts own reading in words read and passages', () => {
    const r = yearInReading({
      log: [], shelves: { es: [es(), es({ title: 'Otro', plainText: 'uno dos tres' })] },
      decks: {}, srs: null, lessonsDone: [], today: '2026-09-29', shelfCap: MAX_ENTRIES,
    });
    expect(r.passages).toBe(2);
    expect(r.wordsRead).toBe(countWords(prose, false) + 3);
    expect(r.byLanguage[0].language).toBe('es');
  });

  it('adds up alongside generated reading rather than replacing it', () => {
    const generated: ShelfEntry = {
      id: 'g', date: '2026-09-21', language: 'es', level: 1, title: 'g',
      text: 'uno dos', vocabWords: [],
    };
    const r = yearInReading({
      log: [], shelves: { es: [es(), generated] }, decks: {}, srs: null,
      lessonsDone: [], today: '2026-09-29', shelfCap: MAX_ENTRIES,
    });
    expect(r.passages).toBe(2);
    expect(r.wordsRead).toBe(countWords(prose, false) + 2);
  });
});

/**
 * REMOVING FROM THE SHELF — and the tombstone, which is the whole difficulty.
 *
 * `saveShelf` is authoritative, so dropping an entry would be enough if entries were only
 * ever written. They are not: `LocalStorage.saveDailyContent` re-derives today's entries from
 * the cached content on every save and unions them in. A union cannot express a removal.
 */
describe('removing a passage from the shelf', () => {
  const e = (id: string): ShelfEntry => ({
    id, date: '2026-10-04', language: 'zh', level: 1, title: id,
    text: '', sentences: [], vocabWords: [],
  } as unknown as ShelfEntry);

  it('drops the entry and records the tombstone', () => {
    const before = [e('a'), e('b'), e('c')];
    const { entries, removed } = removeEntry(before, 'b', new Set());
    expect(entries.map(x => x.id)).toEqual(['a', 'c']);
    expect([...removed]).toEqual(['b']);
  });

  it('is a no-op for an id that is not there, and does not invent a tombstone', () => {
    const before = [e('a')];
    const { entries, removed } = removeEntry(before, 'zzz', new Set());
    expect(entries).toBe(before);          // same reference — nothing was rebuilt
    expect(removed.size).toBe(0);
  });

  it('accumulates tombstones rather than replacing them', () => {
    let state = { entries: [e('a'), e('b'), e('c')], removed: new Set<string>() };
    state = removeEntry(state.entries, 'a', state.removed);
    state = removeEntry(state.entries, 'c', state.removed);
    expect([...state.removed].sort()).toEqual(['a', 'c']);
    expect(state.entries.map(x => x.id)).toEqual(['b']);
  });

  it('withoutRemoved is what stops a deleted passage being re-derived', () => {
    // This is the real scenario: entriesFrom rebuilds today's passage, mergeShelf unions it
    // back in, and the learner sees the thing they deleted return.
    const rederived = [e('today-0'), e('today-1')];
    const removed = new Set(['today-0']);
    expect(withoutRemoved(rederived, removed).map(x => x.id)).toEqual(['today-1']);
  });

  it('withoutRemoved is free when nothing was removed', () => {
    const list = [e('a'), e('b')];
    expect(withoutRemoved(list, new Set())).toBe(list);   // same reference
  });

  it('a union WOULD resurrect it — the control for the whole design', () => {
    const shelf = [e('b')];                        // 'a' was deleted
    const rederived = [e('a'), e('b')];            // the day's cache still holds it
    expect(mergeShelf(shelf, rederived).map(x => x.id).sort()).toEqual(['a', 'b']);
    // …which is exactly why saveDailyContent filters through withoutRemoved first.
    expect(mergeShelf(shelf, withoutRemoved(rederived, new Set(['a']))).map(x => x.id)).toEqual(['b']);
  });
});
