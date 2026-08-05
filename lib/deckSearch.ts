import type { DeckWord } from './types';
import { isDueToday } from './deck';

/** Strip tone marks / diacritics so "xing" matches "xíng". */
function deaccent(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Anki-flavored deck search. Space-separated terms are ANDed. Supported:
 *   plain text          — matches hanzi / pinyin (accent-insensitive) / meaning
 *   is:due|new|paused|snoozed|leech|focus|learning|review
 *   lapses|reviews >|<|>=|<=|= N
 *   deck:Name           — substring match on the word's deck
 */
export function matchesSearch(w: DeckWord, query: string, today: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every(term => matchTerm(w, term, today));
}

function matchTerm(w: DeckWord, term: string, today: string): boolean {
  if (term.startsWith('is:')) {
    switch (term.slice(3)) {
      case 'due':      return isDueToday(w, today);
      case 'new':      return (w.reviews ?? 0) === 0 && w.stability === undefined;
      case 'paused':   return !!w.paused;
      case 'snoozed':  return !!w.snoozeUntil && w.snoozeUntil > today;
      case 'leech':
      case 'stuck':    return !!w.leech;
      case 'focus':
      case 'starred':  return !!w.focus;
      case 'learning': return w.phase === 'learning';
      case 'review':   return w.phase === 'review';
      default:         return false;
    }
  }

  const num = term.match(/^(lapses|reviews)(>=|<=|>|<|=)(\d+)$/);
  if (num) {
    const field = num[1] === 'lapses' ? (w.lapses ?? 0) : (w.reviews ?? 0);
    const n = parseInt(num[3], 10);
    switch (num[2]) {
      case '>':  return field > n;
      case '<':  return field < n;
      case '>=': return field >= n;
      case '<=': return field <= n;
      case '=':  return field === n;
    }
  }

  // Plain text — hanzi / accent-insensitive pinyin / meaning.
  const hay = deaccent(`${w.h} ${w.p} ${w.m}`.toLowerCase());
  return hay.includes(deaccent(term));
}
