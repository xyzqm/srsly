import { describe, it, expect } from 'vitest';
import { summarise, fmtDays, MIN_MODELLED, DECAY_DAYS, AT_RISK_SHOWN, STABILITY_BANDS } from '@/lib/retention';
import { DEFAULT_SRS_SETTINGS, retrievability } from '@/lib/fsrs';
import type { DeckWord } from '@/lib/types';

const TODAY = '2026-10-04';
const settings = DEFAULT_SRS_SETTINGS;

/** A graduated card last reviewed `ago` days back with stability `s`. */
function card(i: number, s: number, ago: number, over: Partial<DeckWord> = {}): DeckWord {
  const d = new Date('2026-10-04T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ago);
  return {
    id: `c${i}`, h: `字${i}`, p: 'zi', m: 'word',
    phase: 'review', stability: s, difficulty: 5, lapses: 0, reviews: 3,
    lastReview: d.toISOString().slice(0, 10),
    ...over,
  };
}
const many = (n: number, s = 30, ago = 1) => Array.from({ length: n }, (_, i) => card(i, s, ago));

describe('it refuses to speak before it can', () => {
  it('is sparse below MIN_MODELLED and reports the counts anyway', () => {
    const r = summarise(many(MIN_MODELLED - 1), settings, TODAY);
    expect(r.sparse).toBe(true);
    expect(r.modelled).toBe(MIN_MODELLED - 1);
    expect(r.bands).toEqual([]);
    expect(r.decay).toEqual([]);
  });

  it('speaks at exactly MIN_MODELLED', () => {
    expect(summarise(many(MIN_MODELLED), settings, TODAY).sparse).toBe(false);
  });

  it('an empty deck is an answer, not a crash', () => {
    const r = summarise([], settings, TODAY);
    expect(r.sparse).toBe(true);
    expect(r.modelled).toBe(0);
    expect(r.unmodelled).toBe(0);
  });
});

describe('a card with no model is skipped and counted, never averaged in', () => {
  it('excludes new and learning cards from the mean', () => {
    const deck = [
      ...many(MIN_MODELLED, 30, 1),
      { id: 'n1', h: '新', p: 'xin', m: 'new' } as DeckWord,            // never reviewed
      card(99, 10, 1, { phase: 'learning' }),                            // still learning
    ];
    const r = summarise(deck, settings, TODAY);
    expect(r.modelled).toBe(MIN_MODELLED);
    expect(r.unmodelled).toBe(2);
    // The mean is the modelled cards' alone — a fresh card must not read as amnesia.
    expect(r.recallToday).toBeCloseTo(retrievability(1, 30), 10);
  });

  it('excludes a card with zero or missing stability rather than scoring it 0', () => {
    const r = summarise([...many(MIN_MODELLED), card(98, 0, 1)], settings, TODAY);
    expect(r.modelled).toBe(MIN_MODELLED);
    expect(r.unmodelled).toBe(1);
  });

  it('excludes pooled, paused and snoozed cards, like every other queue', () => {
    const deck = [
      ...many(MIN_MODELLED),
      card(90, 30, 1, { pool: true }),
      card(91, 30, 1, { paused: true }),
      card(92, 30, 1, { snoozeUntil: '2026-12-01' }),
    ];
    const r = summarise(deck, settings, TODAY);
    expect(r.modelled).toBe(MIN_MODELLED);
    expect(r.unmodelled).toBe(0);     // they are not active at all, so not "unmodelled" either
  });
});

describe('the numbers mean what they say', () => {
  it('recallToday is the model, and forgettingIndex is its complement', () => {
    const r = summarise(many(20, 30, 30), settings, TODAY);
    // t = S ⇒ R = 0.9, by construction of the FSRS curve.
    expect(r.recallToday).toBeCloseTo(0.9, 6);
    expect(r.forgettingIndex).toBeCloseTo(0.1, 6);
    expect(r.recallToday + r.forgettingIndex).toBeCloseTo(1, 10);
  });

  it('uses the MEDIAN stability, so a couple of very strong cards cannot flatter the deck', () => {
    const deck = [...many(MIN_MODELLED, 10, 1), card(50, 3650, 1), card(51, 3650, 1)];
    const r = summarise(deck, settings, TODAY);
    expect(r.medianStability).toBe(10);
    const mean = deck.reduce((a, w) => a + (w.stability ?? 0), 0) / deck.length;
    expect(mean).toBeGreaterThan(500);          // the control: a mean would have said ~530
  });

  it('bands every modelled card exactly once', () => {
    const deck = [
      ...many(MIN_MODELLED, 0.5, 0),
      card(60, 3, 0), card(61, 15, 0), card(62, 60, 0), card(63, 200, 0), card(64, 5000, 0),
    ];
    const r = summarise(deck, settings, TODAY);
    expect(r.bands.map(b => b.label)).toEqual(STABILITY_BANDS.map(b => b.label));
    expect(r.bands.reduce((a, b) => a + b.count, 0)).toBe(r.modelled);
    expect(r.bands[0].count).toBe(MIN_MODELLED);  // <1d
    expect(r.bands[5].count).toBe(1);             // 1y+
  });
});

describe('the decay curve is a counterfactual and behaves like one', () => {
  it('starts at today and only ever falls', () => {
    const r = summarise(many(20, 30, 1), settings, TODAY);
    expect(r.decay).toHaveLength(DECAY_DAYS + 1);
    expect(r.decay[0].recall).toBeCloseTo(r.recallToday, 10);
    for (let i = 1; i < r.decay.length; i++) {
      expect(r.decay[i].recall).toBeLessThan(r.decay[i - 1].recall);
    }
  });

  it('a more stable deck decays more slowly', () => {
    const weak = summarise(many(20, 7, 1), settings, TODAY);
    const strong = summarise(many(20, 365, 1), settings, TODAY);
    expect(strong.decay[DECAY_DAYS].recall).toBeGreaterThan(weak.decay[DECAY_DAYS].recall);
  });
});

describe('at risk is not the same question as due', () => {
  it('names the worst cards, sorted, and counts the rest', () => {
    // Long-overdue cards: t far past S puts R well under target.
    const deck = [...many(MIN_MODELLED, 30, 1), ...Array.from({ length: 10 }, (_, i) => card(70 + i, 2, 40 + i))];
    const r = summarise(deck, settings, TODAY);
    expect(r.atRiskTotal).toBe(10);
    expect(r.atRisk).toHaveLength(AT_RISK_SHOWN);
    for (let i = 1; i < r.atRisk.length; i++) {
      expect(r.atRisk[i].recall).toBeGreaterThanOrEqual(r.atRisk[i - 1].recall);
    }
    expect(r.atRisk.every(c => c.recall < settings.desiredRetention)).toBe(true);
  });

  it('a card reviewed today is never at risk', () => {
    const r = summarise(many(20, 30, 0), settings, TODAY);
    expect(r.atRiskTotal).toBe(0);
    expect(r.decay[0].recall).toBeCloseTo(1, 6);
  });

  it('honours a changed desiredRetention', () => {
    const deck = many(20, 30, 30);              // every card sits at exactly 0.9
    const lax = summarise(deck, { ...settings, desiredRetention: 0.85 }, TODAY);
    const strict = summarise(deck, { ...settings, desiredRetention: 0.95 }, TODAY);
    expect(lax.atRiskTotal).toBe(0);
    expect(strict.atRiskTotal).toBe(20);
  });
});

describe('nothing here is stored, and a test says so', () => {
  it('is a pure function of its arguments — same deck, same answer', () => {
    const deck = many(20, 30, 5);
    expect(summarise(deck, settings, TODAY)).toEqual(summarise(deck, settings, TODAY));
  });

  it('does not mutate the deck it is given', () => {
    const deck = many(20, 30, 5);
    const snapshot = JSON.stringify(deck);
    summarise(deck, settings, TODAY);
    expect(JSON.stringify(deck)).toBe(snapshot);
  });
});

describe('fmtDays', () => {
  it('reads like a person', () => {
    expect(fmtDays(0.4)).toBe('<1 day');
    expect(fmtDays(3)).toBe('3 days');
    expect(fmtDays(21)).toBe('3 weeks');
    expect(fmtDays(90)).toBe('3 months');
    expect(fmtDays(730)).toBe('2.0 years');
  });
});
