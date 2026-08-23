import { describe, it, expect } from 'vitest';
import { passageTopic, passageForm, PASSAGE_TOPICS, PASSAGE_FORMS } from '@/lib/passageTheme';
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

  // The old hash summed the date's parts, so 2026+8+22 and 2026+9+21 both made 2056.
  it('does not collide on dates a month apart', () => {
    expect(passageTopic('2026-08-22', 'es', 1)).not.toBe(passageTopic('2026-09-21', 'es', 1));
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

  // A walk of +1 per day repeats in as many days as the list is long, and reads as a walk.
  // Spread over a year is the property that actually matters to a daily user.
  it('spreads across the list over a year rather than walking it', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 365; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      seen.add(passageTopic(date, 'es', 1));
    }
    expect(seen.size).toBe(PASSAGE_TOPICS.length);
  });
});

describe('passageForm varies the shape of the text', () => {
  it('is seeded independently of the topic', () => {
    // If form tracked topic, every date landing on topic N would land on form N % 8 too.
    // Collect the pairings and check more than one form shows up for a given topic.
    const byTopic = new Map<string, Set<string>>();
    for (let d = 0; d < 365; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      const t = passageTopic(date, 'es', 1);
      const f = passageForm(date, 'es', 1);
      if (!byTopic.has(t)) byTopic.set(t, new Set());
      byTopic.get(t)!.add(f);
    }
    const varied = [...byTopic.values()].filter(forms => forms.size > 1);
    expect(varied.length).toBeGreaterThan(0);
  });

  it('only ever returns a form from the list', () => {
    expect(PASSAGE_FORMS).toContain(passageForm('2026-08-22', 'ja', 2) as never);
  });

  it('is a pure function of its inputs', () => {
    expect(passageForm('2026-08-22', 'zh', 1, 1)).toBe(passageForm('2026-08-22', 'zh', 1, 1));
  });
});
