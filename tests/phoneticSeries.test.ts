import { describe, it, expect } from 'vitest';
import cedictData from '@dict/cedict.json';
import { HAN_DECOMP } from '@/lib/data/han-decomp';
import type { HanEntry } from '@/lib/hanDecomp';
import {
  toneless, nearSyllable, buildSeries, clusters, RELIABLE_THRESHOLD,
} from '@/lib/phoneticSeries';

/**
 * Phonetic series, against the REAL decomposition table and the REAL dictionary.
 *
 * Deliberately not fixtures, for the reason the lemmatizer tests give: every claim here is a
 * claim ABOUT that data — that 青 is 86% consistent once palatalization is allowed for, that
 * 者 is not — and a stub would test the arithmetic rather than the language.
 */

const ced = cedictData as unknown as Record<string, { p?: string }>;
const decomp = HAN_DECOMP as unknown as Record<string, HanEntry>;
const readingOf = (ch: string) => ced[ch]?.p;
const series = buildSeries(decomp, readingOf);

describe('tone is stripped, ü is not', () => {
  it('removes tone marks', () => {
    expect(toneless('qīng')).toBe('qing');
    expect(toneless('hǎi')).toBe('hai');
  });

  /**
   * `ü` decomposes under NFD into u + diaeresis, and that diaeresis is indistinguishable from
   * a tone mark to a combining-mark strip. Losing it merges 女 nü into 努 nu.
   */
  it('keeps ü, which is a vowel and not a tone', () => {
    expect(toneless('nǚ')).toBe('nü');
    expect(toneless('lǜ')).toBe('lü');
    expect(toneless('nǚ')).not.toBe(toneless('nǔ'));
  });

  it('takes only the first syllable of a multi-syllable reading', () => {
    expect(toneless('kā fēi')).toBe('ka');
  });
});

describe('tolerance is PAIRWISE and must never become transitive', () => {
  /**
   * THE TRAP THIS FILE EXISTS FOR. The three pairs chain — retroflex ↔ sibilant ↔ palatal ↔
   * velar — so unioning them into equivalence classes puts every sibilant and velar in
   * Mandarin in one bucket, and the reliability threshold stops filtering anything. The
   * failure is SILENT: the numbers only improve. These are the assertions that catch it.
   */
  it('does not connect zh to g across two hops', () => {
    expect(nearSyllable('zhi', 'gi')).toBe(false);
    expect(nearSyllable('zhang', 'gang')).toBe(false);
  });

  it('does not connect retroflex to palatal, one hop too far', () => {
    expect(nearSyllable('zhang', 'jang')).toBe(false);
    expect(nearSyllable('shi', 'xi')).toBe(false);
  });

  it('does allow each declared pair on its own', () => {
    expect(nearSyllable('qing', 'jing')).toBe(true);   // palatal within itself
    expect(nearSyllable('gang', 'jang')).toBe(true);   // velar ↔ palatal
    expect(nearSyllable('zang', 'jang')).toBe(true);   // sibilant ↔ palatal
    expect(nearSyllable('zhang', 'zang')).toBe(true);  // retroflex ↔ sibilant
  });

  it('never merges across different finals, however close the initials', () => {
    expect(nearSyllable('qing', 'jong')).toBe(false);
    expect(nearSyllable('cai', 'qing')).toBe(false);
  });

  it('treats a bare final as itself only', () => {
    expect(nearSyllable('an', 'an')).toBe(true);
    expect(nearSyllable('an', 'gan')).toBe(false);
  });
});

describe('the families the app will actually teach', () => {
  /**
   * 青 is the example the whole feature is built around, and a unanimity rule EXCLUDED it:
   * 清情请晴 are qing but 睛精 are jing and 猜 is cai. Allowing the palatalization split is
   * what brings it back, and if this drops below the threshold the feature has lost its
   * headline example.
   */
  it('rates 青 as predictive, which only tolerance achieves', () => {
    const s = series.get('青')!;
    expect(s).toBeDefined();
    expect(s.reliability).toBeGreaterThanOrEqual(RELIABLE_THRESHOLD);
    expect(s.modalReading).toBe('qing');
  });

  /** The biggest family in the data, and it predicts nothing — three clusters, not one. */
  it('rates 者 as NOT predictive, and can still teach it as clusters', () => {
    const s = series.get('者')!;
    expect(s.predictive).toBe(false);
    const groups = clusters(s);
    expect(groups.length).toBeGreaterThanOrEqual(3);
    expect(groups[0].map(m => m.char).join('')).toMatch(/猪|诸|著/);
  });

  it('rates 隹 as not predictive — nine members, nine readings', () => {
    expect(series.get('隹')!.predictive).toBe(false);
  });

  it('clusters cover every member exactly once', () => {
    for (const s of series.values()) {
      const n = clusters(s).reduce((a, g) => a + g.length, 0);
      expect(n).toBe(s.members.length);
    }
  });
});

describe('the golden numbers', () => {
  /**
   * PINNED ON PURPOSE. The tolerance pairs are a stated opinion, so changing them has to be a
   * VISIBLE decision — otherwise someone widens a group, the predictive set grows, and it
   * reads as an improvement rather than as the threshold quietly ceasing to filter.
   *
   * If this fails, the question is not "update the number" but "which pair moved, and is the
   * new set still honest?"
   */
  it('is 91 predictive families covering 379 characters', () => {
    const predictive = [...series.values()].filter(s => s.predictive);
    const chars = predictive.reduce((a, s) => a + s.members.length, 0);
    expect({ families: predictive.length, chars }).toEqual({ families: 91, chars: 379 });
  });

  it('leaves most families below the bar, which is the honest outcome', () => {
    const all = [...series.values()];
    expect(all.filter(s => !s.predictive).length).toBeGreaterThan(all.length / 2);
  });
});
