import { describe, it, expect } from 'vitest';
import { unitsFor, hasLessons, LESSON_LANGUAGES } from '@/lib/lessons';
import { lessonsFor } from '@/lib/data/lessons';
import { BEGINNER_THEMES } from '@/lib/data/beginner-themes';
import { segmentFr } from '@/lib/server/frenchSegmenter';
import { segmentEs } from '@/lib/server/spanishSegmenter';
import { segmentZh } from '@/lib/server/chineseSegmenter';
import { segmentJa } from '@/lib/server/kuromojiSegmenter';
import cedictData from '@dict/cedict.json';
import { HSK_VOCAB } from '@/lib/data/hsk-vocab';
import type { LanguageCode } from '@/lib/types';

/**
 * A lesson's examples are held to the starter texts' bar: EVERY word must resolve in our own
 * dictionary, checked through the REAL segmenter rather than a stub. The whole app is built on
 * tapping a word to find out what it means, so an example sentence you cannot tap through
 * teaches the opposite of what the lesson is for.
 *
 * The vocabulary lessons are checked differently — they name a theme rather than carrying
 * words, so what matters is that the theme exists and is not empty. The words themselves were
 * already validated against the dictionary when `scripts/build-themes.mjs` emitted them.
 *
 * Everything here is parameterised over LESSON_LANGUAGES, so adding a third tree gets the whole
 * suite for free and cannot ship without passing it.
 */
type Segmenter = (s: string, o: Map<string, { p: string; m: string }>) => Array<string[]>;

/**
 * THREE VALIDATION STRATEGIES, because the pipelines genuinely differ.
 *
 * French, Spanish and Japanese resolve meanings SERVER-side, so a resolved token carries its
 * gloss in the third slot and the check is on the tuple width. Chinese deliberately does not:
 * `segmentZh` emits every non-deck token bare and the client looks it up through
 * lib/data/dict.ts, because CC-CEDICT's first sense is often the wrong one. So Chinese is
 * checked against the same tables the client consults — exactly as tests/starterTexts.test.ts
 * does, and for the same reason.
 *
 * Japanese is the only async one, since kuromoji has to load.
 */
const cedict = cedictData as unknown as Record<string, { p: string; m: string }>;
const HAN = /[\u4e00-\u9fff]/;

/** Words a lesson example may use that are not vocabulary the dictionary carries. */
async function unresolvedWords(lang: LanguageCode, text: string): Promise<string[]> {
  if (lang === 'zh') {
    // Bare tokens by design: check the Han words against what the client would consult.
    return segmentZh(text, new Map())
      .map(t => t[0])
      .filter(w => HAN.test(w))
      .filter(w => !(w in cedict) && !(w in HSK_VOCAB));
  }
  const toks = lang === 'ja'
    ? await segmentJa(text, new Map())
    : (lang === 'fr' ? segmentFr : segmentEs)(text, new Map()) as unknown as Array<string[]>;
  return toks
    .filter(t => t.length > 1)                    // punctuation is a 1-tuple
    .filter(t => !(t.length >= 3 && t[2]))        // no gloss resolved
    .map(t => t[0]);
}

const SEGMENTERS: Record<string, Segmenter> = {
  fr: segmentFr as unknown as Segmenter,
  es: segmentEs as unknown as Segmenter,
};

const allThemes = BEGINNER_THEMES as Record<string, Record<string, string[]>>;

describe('every language with a tree declares one', () => {
  it('is offered for all four', () => {
    for (const l of ['fr', 'es', 'zh', 'ja'] as const) expect(hasLessons(l), l).toBe(true);
  });

  it('never claims a language whose tree is actually empty', () => {
    for (const l of LESSON_LANGUAGES) {
      expect(lessonsFor(l).length, `${l} is listed but has no lessons`).toBeGreaterThan(0);
    }
  });
});

for (const lang of LESSON_LANGUAGES as LanguageCode[]) {
  const lessons = lessonsFor(lang);
  const themes = allThemes[lang] ?? {};

  describe(`${lang}: the tree is structurally sound`, () => {
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
      expect(lessons.filter(l => l.kind === 'grammar').length).toBeGreaterThanOrEqual(12);
      expect(lessons.filter(l => l.kind === 'vocab').length).toBeGreaterThanOrEqual(8);
    });
  });

  describe(`${lang}: grammar lessons`, () => {
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
     * THE ONE THAT MATTERS, and it has no exemptions. It briefly carried two for French — `au`,
     * which the dictionary's contraction filter had deleted outright, and `est-ce`, which the
     * segmenter kept whole as one unlookupable token. Both were fixed at the source rather than
     * written around, and this list stays empty.
     */
    it('uses only words that resolve in the real dictionary', async () => {
      const misses: string[] = [];
      for (const l of grammar) {
        for (const ex of l.examples ?? []) {
          for (const w of await unresolvedWords(lang, ex.text)) {
            misses.push(`${l.id}: "${w}" in «${ex.text}»`);
          }
        }
      }
      expect(misses, `unlookupable words:\n  ${misses.join('\n  ')}`).toEqual([]);
    }, 120_000);
  });

  describe(`${lang}: vocabulary lessons`, () => {
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
}

/** Ids are the persistence key for completion, so a collision across trees would merge them. */
describe('ids are unique across every language', () => {
  it('never reuses an id between trees', () => {
    const ids = (LESSON_LANGUAGES as LanguageCode[]).flatMap(l => lessonsFor(l).map(x => x.id));
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `ids shared between languages: ${dupes.join(', ')}`).toEqual([]);
  });
});
