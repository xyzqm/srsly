import { describe, it, expect } from 'vitest';
import { STARTER_TEXTS, starterTexts } from '@/lib/data/starterTexts';
import { splitSentences } from '@/lib/server/sentenceSplit';
import { segmentEs } from '@/lib/server/spanishSegmenter';
import { segmentFr } from '@/lib/server/frenchSegmenter';
import { segmentZh } from '@/lib/server/chineseSegmenter';
import cedictData from '@dict/cedict.json';
import { HSK_VOCAB } from '@/lib/data/hsk-vocab';
import type { LanguageCode } from '@/lib/types';
import { getLanguageConfig } from '@/lib/languageConfig';
import { segmentJa, type RawTok } from '@/lib/server/kuromojiSegmenter';

/**
 * A starter text is the first thing a new learner reads, and the whole pitch is "tap any word
 * and get a real definition". A word that does not resolve teaches the opposite in the first
 * thirty seconds, so these run through the REAL dictionaries and the REAL segmenters — the
 * same code path `/api/segment-text` takes at request time.
 *
 * All four languages are covered, but by two different tests, because the pipeline differs:
 * Spanish, French and Japanese resolve meanings SERVER-side and so carry a gloss in the token,
 * while Chinese deliberately does not (see below).
 */

/**
 * Spanish and French resolve meanings SERVER-side, so a resolved token carries its gloss in
 * the 3rd slot. Chinese does not: `segmentZh` deliberately emits every non-deck token bare and
 * the client looks it up through lib/data/dict.ts, because CC-CEDICT's first sense is often
 * the wrong one (现代 → "Hyundai, South Korean company"). So Chinese is checked against the
 * same tables the client consults, rather than against the tuple width.
 */
const SEGMENTERS: Partial<Record<LanguageCode, (s: string, o: Map<string, { p: string; m: string }>) => RawTok[]>> = {
  es: segmentEs,
  fr: segmentFr,
};

const cedict = cedictData as unknown as Record<string, { p: string; m: string }>;
const HAN = /[\u4e00-\u9fff]/;
const zhKnown = (w: string) => w in cedict || w in HSK_VOCAB;

/** A 3-or-4-element tuple carries a meaning; a 1-element tuple is punctuation. */
function resolved(toks: RawTok[]): { words: number; withMeaning: number; misses: string[] } {
  let words = 0, withMeaning = 0;
  const misses: string[] = [];
  for (const t of toks) {
    if (t.length === 1) continue;             // punctuation
    words++;
    if (t.length >= 3 && t[2]) withMeaning++;
    else misses.push(t[0]);
  }
  return { words, withMeaning, misses };
}

describe('every starter text is structurally sound', () => {
  const langs = Object.keys(STARTER_TEXTS) as LanguageCode[];

  it('ships three per language', () => {
    for (const l of langs) expect(starterTexts(l), l).toHaveLength(3);
  });

  it('has unique ids across every language', () => {
    const ids = langs.flatMap(l => starterTexts(l).map(t => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is short enough to finish in one sitting', () => {
    for (const l of langs) {
      for (const t of starterTexts(l)) {
        expect(t.text.length, `${t.id} length`).toBeLessThan(400);
        expect(t.text.trim().length, `${t.id} empty`).toBeGreaterThan(40);
      }
    }
  });

  it('carries a title and a blurb', () => {
    for (const l of langs) {
      for (const t of starterTexts(l)) {
        expect(t.title.trim(), t.id).not.toBe('');
        expect(t.blurb.trim(), t.id).not.toBe('');
      }
    }
  });

  // An English word left in a target-language text is easy to do and embarrassing to ship —
  // it happened once while writing these (`去公园walk`).
  it('has no stray Latin words in the CJK texts', () => {
    for (const l of ['zh', 'ja'] as LanguageCode[]) {
      for (const t of starterTexts(l)) {
        expect(t.text, `${t.id} contains Latin letters`).not.toMatch(/[A-Za-z]{2,}/);
      }
    }
  });
});

describe('every word resolves against the real dictionary', () => {
  for (const [lang, segment] of Object.entries(SEGMENTERS) as [LanguageCode, NonNullable<typeof SEGMENTERS['es']>][]) {
    for (const t of starterTexts(lang)) {
      it(`${t.id} — "${t.title}"`, () => {
        const overrides = new Map<string, { p: string; m: string }>();
        let words = 0, withMeaning = 0;
        const misses: string[] = [];

        const unspaced = getLanguageConfig(lang).scriptIsUnspaced;
        for (const sentence of splitSentences(t.text, unspaced)) {
          const toks = segment(sentence, overrides);
          const r = resolved(toks);
          words += r.words;
          withMeaning += r.withMeaning;
          misses.push(...r.misses);
        }

        expect(words, 'produced no words at all').toBeGreaterThan(10);
        // Proper nouns are filtered out of the dictionaries at build time
        // (scripts/lib/nameFilter.mjs), so a name in the prose legitimately will not resolve.
        // Everything else must, which is what the high bar is protecting.
        const rate = withMeaning / words;
        expect(rate, `unresolved: ${[...new Set(misses)].join(', ')}`).toBeGreaterThanOrEqual(0.9);
      });
    }
  }

  // Japanese resolves server-side like es/fr, but segmentJa is async (kuromoji).
  for (const t of starterTexts('ja')) {
    it(`${t.id} — "${t.title}"`, async () => {
      let words = 0, withMeaning = 0;
      const misses: string[] = [];
      for (const sentence of splitSentences(t.text, true)) {
        const r = resolved(await segmentJa(sentence, new Map()));
        words += r.words; withMeaning += r.withMeaning; misses.push(...r.misses);
      }
      expect(words, 'produced no words at all').toBeGreaterThan(10);
      expect(withMeaning / words, `unresolved: ${[...new Set(misses)].join(', ')}`)
        .toBeGreaterThanOrEqual(0.9);
    }, 60000);
  }

  for (const t of starterTexts('zh')) {
    it(`${t.id} — "${t.title}" (client-side lookup)`, () => {
      const toks = splitSentences(t.text, true)
        .flatMap(sentence => segmentZh(sentence, new Map()));
      const han = toks.map(x => x[0]).filter(w => HAN.test(w));
      const misses = han.filter(w => !zhKnown(w));

      expect(han.length, 'produced no Han words').toBeGreaterThan(10);
      expect(misses, `unresolved: ${[...new Set(misses)].join(', ')}`).toHaveLength(0);
    });
  }
});

/**
 * JMdict is keyed by spelling, and Japanese particles are kana that also spell ordinary nouns.
 * A plain lookup glossed the particle に as 荷 — "load; baggage; cargo" — in 六時に起きます,
 * which is a confidently wrong answer handed to exactly the beginner least able to catch it.
 */
describe('Japanese particles are glossed as grammar, not as homophone nouns', () => {
  it('に in a time expression is a particle, not baggage', async () => {
    const toks = await segmentJa('毎朝六時に起きます。', new Map());
    const ni = toks.find(t => t[0] === 'に');
    expect(ni?.[2]).toBeTruthy();
    expect(ni?.[2]).not.toMatch(/baggage|cargo|load/i);
    expect(ni?.[2]).toMatch(/direction|time|indirect/i);
  }, 60000);

  it('leaves content words alone', async () => {
    const toks = await segmentJa('毎朝六時に起きます。', new Map());
    expect(toks.find(t => t[0] === '毎朝')?.[2]).toMatch(/every morning/i);
    expect(toks.find(t => t[0] === '起きます')?.[2]).toMatch(/to get up|to rise/i);
  }, 60000);

  // An unrecognised grammatical word must fall through to NOTHING, never to JMdict — that
  // fallback is the bug, not the safety net.
  it('never lets a particle reach the noun dictionary', async () => {
    const toks = await segmentJa('わたしは学校へ行きます。', new Map());
    for (const p of ['は', 'へ']) {
      const t = toks.find(x => x[0] === p);
      expect(t?.[2] ?? '', p).not.toMatch(/leaf|tooth|side|edge/i);
    }
  }, 60000);
});
