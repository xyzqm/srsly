import type { DeckWord } from './types';

/** Formats a Date as YYYY-MM-DD using its local calendar day (not UTC). */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
 *  now" — e.g. whether a word should render as a cloze blank. Compares raw timestamps, not
 *  calendar days: with short-term (sub-day) scheduling enabled in srs.ts, a card can come back
 *  due in minutes rather than a full day out, so "due today" is no longer precise enough here. */
export function isDue(w: DeckWord, now: Date = new Date()): boolean {
  return isActive(w) && w.due.getTime() <= now.getTime();
}

/** Active AND due by the end of today's local calendar day — looser than isDue, which requires
 *  due <= now. Used only to decide which words a new passage may be generated around: reviewing
 *  a word scheduled for later today is allowed without confirmation, but nothing further out
 *  ever is, so this (deliberately) never reaches beyond "today". Not for cloze-blank rendering —
 *  isDue's precise timestamp is what matters there. */
export function isDueToday(w: DeckWord, now: Date = new Date()): boolean {
  return isActive(w) && localDateStr(w.due) <= localDateStr(now);
}
