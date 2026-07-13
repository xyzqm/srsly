import type { DeckWord } from './types';

/** Formats a Date as YYYY-MM-DD using its local calendar day (not UTC). */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

/** Active AND due on/before today's local calendar day. The single source of truth for
 *  "study this now". Compares by calendar day so a card due later today still counts. */
export function isDueToday(w: DeckWord, now: Date = new Date()): boolean {
  return isActive(w) && localDateStr(w.due) <= localDateStr(now);
}

export const identity = (w: { h: string; m: string }) => `${w.h}${w.m.trim()}`;
