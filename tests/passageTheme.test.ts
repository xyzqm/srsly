import { describe, it, expect } from 'vitest';
import { passageTopic, passageForm, PASSAGE_TOPICS, BEGINNER_TOPICS, PASSAGE_FORMS } from '@/lib/passageTheme';
import { difficultyTier } from '@/lib/languageConfig';
import type { LanguageCode } from '@/lib/types';

/**
 * These are claims about a reported bug, not about the hash. A learner said "the theme was
 * always the same"; each test below is one of the three concrete ways that was true.
 */
describe('passageTopic stops repeating', () => {
  // The headline bug: themeOffset counts passages within ONE language, so switching language
  // restarted it at 0 and the first passage in the new language got the identical topic.
  it('differs across languages on the same day at the same level', () => {
    const langs: LanguageCode[] = ['zh', 'ja', 'es', 'fr'];
    const picked = langs.map(l => passageTopic('2026-08-22', l, 1));
    expect(new Set(picked).size).toBeGreaterThan(1);
  });

  /**
   * The old hash summed the date's parts, so 2026+8+22 and 2026+9+21 both made 2056.
   *
   * Checked at B1, where the full pool applies. It used to be checked at A1 and no longer can
   * be: a beginner now draws from sixteen topics rather than forty-two (see BEGINNER_TOPICS),
   * so SOME pair of dates a month apart must collide by pigeonhole — that is arithmetic, not
   * the hash bug this guards. The guarantee is about the hash, so it is asserted where the
   * pool is not the binding constraint.
   */
  it('does not collide on dates a month apart', () => {
    expect(passageTopic('2026-08-22', 'es', 3)).not.toBe(passageTopic('2026-09-21', 'es', 3));
  });

  it('changes from one day to the next', () => {
    expect(passageTopic('2026-08-22', 'es', 1)).not.toBe(passageTopic('2026-08-23', 'es', 1));
  });

  it('gives each passage within a day its own topic', () => {
    const a = passageTopic('2026-08-22', 'es', 1, 0);
    const b = passageTopic('2026-08-22', 'es', 1, 1);
    const c = passageTopic('2026-08-22', 'es', 1, 2);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('is a pure function of its inputs', () => {
    expect(passageTopic('2026-08-22', 'fr', 3, 2)).toBe(passageTopic('2026-08-22', 'fr', 3, 2));
  });

  it('only ever returns a topic from the list', () => {
    for (let d = 1; d <= 28; d++) {
      const date = `2026-03-${String(d).padStart(2, '0')}`;
      expect(PASSAGE_TOPICS).toContain(passageTopic(date, 'es', 1) as never);
    }
  });

  /**
   * A walk of +1 per day repeats in as many days as the list is long, and reads as a walk.
   * Spread over a year is the property that actually matters to a daily user.
   *
   * Asserted against the pool the level actually draws from, which is the honest form of the
   * claim now that the pool is tiered: a beginner reaches all sixteen of theirs and an
   * intermediate all forty-two. Hard-coding PASSAGE_TOPICS.length would have quietly become a
   * test that a beginner sees topics they are never offered.
   */
  it.each([[1, BEGINNER_TOPICS.length], [3, PASSAGE_TOPICS.length]])(
    'at level %i spreads across all %i of its topics over a year',
    (level, expected) => {
      const seen = new Set<string>();
      for (let d = 0; d < 365; d++) {
        const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
        seen.add(passageTopic(date, 'es', level));
      }
      expect(seen.size).toBe(expected);
    },
  );
});

describe('passageForm varies the shape of the text', () => {
  /**
   * If form tracked topic, every date landing on topic N would land on one form for ever.
   *
   * THIS ASSERTED `varied.length > 0` AND WAS TOO WEAK FOR ITS OWN PURPOSE. It passed the old
   * implementation at eighteen topics while a topic saw a mean of 4.0 forms out of 8, and at
   * forty-two while it saw 3.5 — already half-collapsed. It only failed when narrowing the
   * beginner pool to sixteen made the collapse total (1.0), because FNV-1a's low bits are a
   * closed system: see `passageForm`. Both halves are now asserted, at both pool sizes, with
   * thresholds the fixed implementation clears at 7.9 / 7.4 / 5.4 and the old one fails.
   */
  it.each([[1, 'beginner pool'], [3, 'full pool']])(
    'at level %i (%s) the form does not track the topic',
    level => {
      const byTopic = new Map<string, Set<string>>();
      for (let d = 0; d < 365; d++) {
        const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
        const t = passageTopic(date, 'es', level as number);
        const f = passageForm(date, 'es', level as number);
        if (!byTopic.has(t)) byTopic.set(t, new Set());
        byTopic.get(t)!.add(f);
      }
      const sizes = [...byTopic.values()].map(forms => forms.size);
      // EVERY topic, not merely one — the old assertion passed on a single exception.
      expect(Math.min(...sizes)).toBeGreaterThan(1);
      const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
      expect(mean).toBeGreaterThanOrEqual(5);
    },
  );

  it('only ever returns a form from the list', () => {
    expect(PASSAGE_FORMS).toContain(passageForm('2026-08-22', 'ja', 2) as never);
  });

  it('is a pure function of its inputs', () => {
    expect(passageForm('2026-08-22', 'zh', 1, 1)).toBe(passageForm('2026-08-22', 'zh', 1, 1));
  });
});

/**
 * The topic pool is tiered, and the measurement that forced it is in BEGINNER_TOPICS.
 *
 * Across 52 generated Spanish passages an A1 reading put 20.1% of its tokens above A1 against
 * 2.6% at C1, and the worst were written about things no A1 vocabulary contains — a beaded
 * bracelet, birdwatching, a mineral discovery.
 */
describe('a beginner never gets a topic they cannot have the words for', () => {
  it('every beginner topic is a real topic', () => {
    for (const t of BEGINNER_TOPICS) expect(PASSAGE_TOPICS).toContain(t as never);
  });

  it('is a narrower pool than the full list, but not a handful', () => {
    expect(BEGINNER_TOPICS.length).toBeLessThan(PASSAGE_TOPICS.length);
    expect(BEGINNER_TOPICS.length).toBeGreaterThanOrEqual(12);
  });

  /**
   * Every language, because the numbering runs in opposite directions — JLPT N5 is the
   * BEGINNER level and HSK 1 and A1 are, so a `level <= 2` test would be right for three
   * languages and backwards for Japanese. Tiering off `difficultyTier` is what makes this
   * hold without a per-language branch.
   */
  const LANGS: LanguageCode[] = ['zh', 'ja', 'es', 'fr'];
  const LEVELS: Record<LanguageCode, number[]> = {
    zh: [1, 2, 3, 4, 5, 6], ja: [5, 4, 3, 2, 1], es: [1, 2, 3, 4, 5, 6], fr: [1, 2, 3, 4, 5, 6],
  } as Record<LanguageCode, number[]>;

  it.each(LANGS)('%s: a beginner level draws only from the beginner pool', lang => {
    const beginner = LEVELS[lang].filter(l => difficultyTier(lang, l) === 'beginner');
    expect(beginner.length).toBeGreaterThan(0);
    for (const level of beginner) {
      for (let offset = 0; offset < 40; offset++) {
        for (const date of ['2026-01-05', '2026-06-14', '2026-11-30']) {
          expect(BEGINNER_TOPICS).toContain(passageTopic(date, lang, level, offset) as never);
        }
      }
    }
  });

  /**
   * The control. Without it the first assertion passes trivially if the beginner pool is
   * simply everything — the point is that the excluded topics really are excluded, and that
   * a higher level really does still reach them.
   */
  it('the topics that produced the worst A1 passages are gone from it, and still reachable above', () => {
    const forced = ['birds and birdwatching', 'craft and making things', 'science and discovery',
                    'the night sky and space', 'photography'];
    for (const t of forced) {
      expect(PASSAGE_TOPICS).toContain(t as never);
      expect(BEGINNER_TOPICS).not.toContain(t as never);
    }
    const reachable = new Set<string>();
    for (let offset = 0; offset < 60; offset++) reachable.add(passageTopic('2026-06-14', 'es', 4, offset));
    expect([...forced].some(t => reachable.has(t))).toBe(true);
  });
});
