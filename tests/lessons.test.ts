import { describe, it, expect } from 'vitest';
import { unitsFor, hasLessons } from '@/lib/lessons';
import { lessonsFor } from '@/lib/data/lessons';
import { BEGINNER_THEMES } from '@/lib/data/beginner-themes';
import { segmentFr } from '@/lib/server/frenchSegmenter';

/**
 * A lesson's examples are held to the starter texts' bar: EVERY word must resolve in our own
 * dictionary, checked through the REAL segmenter rather than a stub. The whole app is built on
 * tapping a word to find out what it means, so an example sentence you cannot tap through
 * teaches the opposite of what the lesson is for.
 *
 * The vocabulary lessons are checked differently — they name a theme rather than carrying
 * words, so what matters is that the theme exists and is not empty. The words themselves were
 * already validated against the dictionary when `scripts/build-themes.mjs` emitted them.
 */
const themes = (BEGINNER_THEMES as Record<string, Record<string, string[]>>).fr ?? {};
const lessons = lessonsFor('fr');

describe('the French lesson tree is structurally sound', () => {
  it('exists for French and not for languages without one', () => {
    expect(hasLessons('fr')).toBe(true);
    for (const l of ['zh', 'ja', 'es'] as const) expect(hasLessons(l), l).toBe(false);
  });

  it('has unique ids', () => {
    const ids = lessons.map(l => l.id);
    expect(new Set(ids).size, `duplicate ids in: ${ids.join(', ')}`).toBe(ids.length);
  });

  it('carries a title and a summary on every lesson', () => {
    for (const l of lessons) {
      expect(l.title.trim(), l.id).not.toBe('');
      expect(l.summary.trim(), l.id).not.toBe('');
    }
  });

  it('groups into units without splitting one in two', () => {
    const units = unitsFor(lessons);
    const names = units.map(u => u.unit);
    expect(new Set(names).size, `a unit is interrupted: ${names.join(' | ')}`).toBe(names.length);
    expect(units.length).toBeGreaterThan(3);
    for (const u of units) expect(u.lessons.length, u.unit).toBeGreaterThan(0);
  });

  it('teaches grammar as well as vocabulary', () => {
    const grammar = lessons.filter(l => l.kind === 'grammar');
    const vocab = lessons.filter(l => l.kind === 'vocab');
    expect(grammar.length).toBeGreaterThanOrEqual(12);
    expect(vocab.length).toBeGreaterThanOrEqual(8);
  });
});

describe('grammar lessons', () => {
  const grammar = lessons.filter(l => l.kind === 'grammar');

  it('all carry explanation prose and examples', () => {
    for (const l of grammar) {
      expect((l.explanation ?? '').trim().length, `${l.id} explanation`).toBeGreaterThan(200);
      expect(l.examples?.length ?? 0, `${l.id} examples`).toBeGreaterThanOrEqual(3);
      expect(l.theme, `${l.id} should not name a vocab theme`).toBeUndefined();
    }
  });

  it('gives every example an English gloss', () => {
    for (const l of grammar) {
      for (const ex of l.examples ?? []) {
        expect(ex.text.trim(), l.id).not.toBe('');
        expect(ex.gloss.trim(), `${l.id}: "${ex.text}"`).not.toBe('');
      }
    }
  });

  /**
   * THE ONE THAT MATTERS. Run every example through the real French segmenter and require a
   * meaning on every word token — the same check `tests/starterTexts.test.ts` applies, through
   * the same code path `/api/segment-text` takes at request time.
   */
  /**
   * No exemptions. This briefly carried two — `au`, which the dictionary's contraction filter
   * had deleted outright, and `est-ce`, which the segmenter kept whole as one unlookupable
   * token. Both are fixed at the source rather than written around, so every word of every
   * example resolves.
   */
  it('uses only words that resolve in the real dictionary', () => {
    const misses: string[] = [];
    for (const l of grammar) {
      for (const ex of l.examples ?? []) {
        for (const tok of segmentFr(ex.text, new Map())) {
          if (tok.length === 1) continue;                    // punctuation
          if (tok.length >= 3 && tok[2]) continue;           // resolved to a gloss
          misses.push(`${l.id}: "${tok[0]}" in «${ex.text}»`);
        }
      }
    }
    expect(misses, `unlookupable words:\n  ${misses.join('\n  ')}`).toEqual([]);
  });

});

describe('vocabulary lessons', () => {
  const vocab = lessons.filter(l => l.kind === 'vocab');

  it('name a theme that actually exists and is not empty', () => {
    for (const l of vocab) {
      expect(l.theme, `${l.id} has no theme`).toBeTruthy();
      const words = themes[l.theme!];
      expect(words, `${l.id}: theme "${l.theme}" is not in beginner-themes`).toBeTruthy();
      expect(words.length, `${l.id}: theme "${l.theme}" is empty`).toBeGreaterThan(3);
    }
  });

  it('does not name the same theme twice', () => {
    const used = vocab.map(l => l.theme);
    expect(new Set(used).size, `repeated themes: ${used.join(', ')}`).toBe(used.length);
  });

  it('carries no explanation or examples — it is a word list, not a reading', () => {
    for (const l of vocab) {
      expect(l.explanation, l.id).toBeUndefined();
      expect(l.examples, l.id).toBeUndefined();
    }
  });
});
