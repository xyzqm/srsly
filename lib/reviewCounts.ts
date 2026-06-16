/**
 * Per-day study counters used to enforce the new-cards/day and reviews/day limits
 * across sessions. Stored in localStorage and reset automatically at the day rollover.
 */
const KEY = 'srsly-review-counts';

export interface ReviewCounts {
  date: string;        // YYYY-MM-DD the counts apply to
  newCount: number;    // new cards introduced today
  reviewCount: number; // review cards shown today
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today's counts, resetting to zero if the stored date is stale. */
export function getTodayCounts(): ReviewCounts {
  const fresh: ReviewCounts = { date: today(), newCount: 0, reviewCount: 0 };
  if (typeof localStorage === 'undefined') return fresh;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ReviewCounts | null;
    if (raw && raw.date === fresh.date) return raw;
  } catch { /* ignore */ }
  return fresh;
}

/** Increment today's new- or review-card counter. */
export function bumpCount(kind: 'new' | 'review'): void {
  if (typeof localStorage === 'undefined') return;
  const c = getTodayCounts();
  if (kind === 'new') c.newCount++;
  else c.reviewCount++;
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ }
}
