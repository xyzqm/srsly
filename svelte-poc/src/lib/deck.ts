import type { DeckWord } from './types';

/** Formats a Date as YYYY-MM-DD using its local calendar day (not UTC). */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Formats a Date as "YYYY-MM-DD HH:MM" in local time — like localDateStr, but with the time of
 *  day, since short-term scheduling can make two cards due on the same calendar day hours apart. */
export function localDateTimeStr(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${localDateStr(d)} ${h}:${min}`;
}

/** Formats how far `due` is from `from` as a short relative delay ("+10m", "+4h", "+3d") — the
 *  interval FSRS just scheduled, rather than an absolute timestamp the reader has to do math on. */
export function formatDelay(due: Date, from: Date): string {
  const mins = Math.round((due.getTime() - from.getTime()) / 60_000);
  if (mins < 60) return `+${Math.max(mins, 1)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `+${hours}h`;
  return `+${Math.round(hours / 24)}d`;
}

/** A Date `n` local days from now (used for card `due` overrides). */
export function dayOffset(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/** A word is in review unless it's still staged in the pool. */
export function isActive(w: DeckWord): boolean {
  return !w.pool;
}

/** Active AND due as of the exact instant `now`. The single source of truth for "study this
 *  now". Compares raw timestamps, not calendar days — with short-term (sub-day) scheduling
 *  enabled in srs.ts, a card can come back due in minutes rather than a full day out, so "due
 *  today" is no longer precise enough. */
export function isDue(w: DeckWord, now: Date = new Date()): boolean {
  return isActive(w) && w.due.getTime() <= now.getTime();
}
