import type { DeckWord } from '@/lib/types';

/** One reading of a character: its pinyin + meaning (and the deck card id, if any). */
export interface ReadingHint {
  id?: string;
  p: string;
  m: string;
}

/** Group a deck by character → its distinct readings (xíng / háng for 行, etc.). */
export function groupReadings(deck: DeckWord[]): Map<string, ReadingHint[]> {
  const map = new Map<string, ReadingHint[]>();
  for (const w of deck) {
    const hint: ReadingHint = { id: w.id, p: w.p, m: w.m };
    const cur = map.get(w.h);
    if (cur) cur.push(hint);
    else map.set(w.h, [hint]);
  }
  return map;
}

/** Tone-insensitive, letters-only pinyin key — "háng" and "hang2" both → "hang". */
function normPinyin(p: string): string {
  return (p || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
}

/**
 * Choose the reading whose pinyin matches a context pinyin (e.g. the reading shown in a
 * passage). Returns the confident match, or null when nothing matches so the caller can
 * fall back gracefully rather than guess. With a single reading, that reading is returned.
 */
export function pickReading(readings: ReadingHint[] | undefined, pinyin: string): ReadingHint | null {
  if (!readings || readings.length === 0) return null;
  if (readings.length === 1) return readings[0];
  const t = normPinyin(pinyin);
  if (!t) return null;
  const exact = readings.find(r => normPinyin(r.p) === t);
  if (exact) return exact;
  // tolerate extra text in a reading's pinyin field by matching the leading syllable
  return readings.find(r => {
    const n = normPinyin(r.p);
    return n.length > 0 && (n.startsWith(t) || t.startsWith(n));
  }) ?? null;
}
