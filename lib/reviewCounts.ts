/**
 * Per-day study counters enforcing the new-cards/day and reviews/day limits.
 *
 * ── THE BUG THIS SHAPE EXISTS FOR ──
 * These were a flat `{ date, newCount, reviewCount }` in localStorage, device-local, while
 * the deck they ration syncs. So a laptop counted to 20 and a phone counted to 20 and the
 * learner got 40 — quietly doubling the intake FSRS is calibrated around, on exactly the
 * setup sync exists to serve.
 *
 * ── WHY A PER-DEVICE TALLY AND NOT A NUMBER ──
 * Neither obvious merge works:
 *
 *   SUM  double-counts on every round trip. A device writes its merged total back, so
 *        a+b becomes a+b+b on the next pass. This is the reason `mergeActivity` is MAX.
 *   MAX  is idempotent but UNDERCOUNTS concurrent use: 12 on one device and 8 on another
 *        merges to 12, and the learner is handed 8 cards the budget had already spent.
 *        For the activity heatmap an undercount is an honest posture and CLAUDE.md says so.
 *        For a BUDGET it means over-serving, which is the one thing a budget is for.
 *
 * So each device only ever increments its OWN entry. Merging takes a per-device MAX, which
 * is idempotent; the total is the sum across devices, which is exact. That is a grow-only
 * counter, and it is the smallest structure that is both correct and safe to replay.
 *
 * ── STILL SYNCHRONOUS ──
 * `getTodayCounts()` is called inside render and effect paths in three files, so it reads
 * localStorage directly rather than going through the async storage layer. The cloud copy
 * rides along on the deck write that grading already performs — see
 * `SupabaseStorage.saveVocabDeck`, which does the same for the activity log.
 */
import { todayStr } from './deck';

const KEY = 'srsly-review-counts';
const DEVICE_KEY = 'srsly-device-id';

/** What a caller sees: the totals, already summed across devices. */
export interface ReviewCounts {
  date: string;        // YYYY-MM-DD the counts apply to
  newCount: number;    // new cards introduced today, everywhere
  reviewCount: number; // review cards shown today, everywhere
}

/** What is stored and synced: one tally per device, so a merge cannot double or lose. */
export interface DayCounts {
  date: string;
  /** device id → { n: new, r: review } */
  by: Record<string, { n: number; r: number }>;
}

/**
 * A stable id for this browser.
 *
 * Only ever used as a map key. It identifies a device to ITSELF so that two devices'
 * increments cannot be confused for one another; it is never sent anywhere but into the
 * learner's own synced row, and it says nothing about who they are.
 */
export function deviceId(): string {
  if (typeof localStorage === 'undefined') return 'server';
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.() ?? `d${Date.now()}${Math.random()}`).slice(0, 12);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

function empty(date = todayStr()): DayCounts {
  return { date, by: {} };
}

/** Sum a day's per-device tallies into the totals a caller cares about. */
export function totals(day: DayCounts): ReviewCounts {
  let newCount = 0, reviewCount = 0;
  for (const v of Object.values(day.by ?? {})) { newCount += v.n ?? 0; reviewCount += v.r ?? 0; }
  return { date: day.date, newCount, reviewCount };
}

/**
 * Read the stored day, migrating the old flat shape and discarding a stale date.
 *
 * The pre-sync value was `{ date, newCount, reviewCount }` with no device dimension. Folding
 * it into THIS device's entry is the honest reading — those cards were studied here — and
 * dropping it instead would hand back a full budget mid-day to anyone upgrading.
 */
export function loadDay(): DayCounts {
  const today = todayStr();
  if (typeof localStorage === 'undefined') return empty(today);
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return empty(today);
    const v = raw as Partial<DayCounts> & Partial<{ newCount: number; reviewCount: number }>;
    if (v.date !== today) return empty(today);          // a new day starts at zero
    if (v.by && typeof v.by === 'object') return { date: today, by: v.by };
    if (typeof v.newCount === 'number' || typeof v.reviewCount === 'number') {
      return { date: today, by: { [deviceId()]: { n: v.newCount ?? 0, r: v.reviewCount ?? 0 } } };
    }
    return empty(today);
  } catch {
    return empty(today);
  }
}

export function saveDay(day: DayCounts): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(day)); } catch { /* quota — the cap is advisory */ }
}

/** Today's totals across every device, resetting to zero at the rollover. */
export function getTodayCounts(): ReviewCounts {
  return totals(loadDay());
}

/** Increment THIS device's tally. Never touches another device's entry. */
export function bumpCount(kind: 'new' | 'review'): void {
  const day = loadDay();
  const id = deviceId();
  const mine = day.by[id] ?? { n: 0, r: 0 };
  if (kind === 'new') mine.n++; else mine.r++;
  day.by[id] = mine;
  saveDay(day);
}

/**
 * Fold two devices' views of a day together.
 *
 * PER-DEVICE MAX, which makes this idempotent: merging a result back into either input
 * changes nothing, so a device writing its merged copy up cannot inflate the total. The sum
 * across entries is then exact rather than a floor.
 *
 * Different DATES do not merge — the later day wins outright. Yesterday's spend must not
 * survive into today, and the two devices simply disagree about what day it is (a timezone
 * apart, or one left open past midnight).
 */
export function mergeCounts(a: DayCounts | null, b: DayCounts | null): DayCounts {
  if (!a) return b ?? empty();
  if (!b) return a;
  if (a.date !== b.date) return a.date > b.date ? a : b;
  const by: DayCounts['by'] = {};
  for (const src of [a.by ?? {}, b.by ?? {}]) {
    for (const [id, v] of Object.entries(src)) {
      const cur = by[id] ?? { n: 0, r: 0 };
      by[id] = { n: Math.max(cur.n, v.n ?? 0), r: Math.max(cur.r, v.r ?? 0) };
    }
  }
  return { date: a.date, by };
}
