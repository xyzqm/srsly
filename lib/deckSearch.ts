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

/**
 * How well a word answers a plain-text query, higher is better. 0 = no textual match.
 *
 * Search used to be a pure filter, with results always ordered by due date — so typing "no"
 * returned `noroeste`, `nombre`, `conocer` and `no` in whatever order the scheduler
 * happened to want, and the word you typed could land last. A filter answers "does this
 * match"; a search has to answer "which of these did you mean".
 *
 * Operator terms (is:due, lapses>3) carry no relevance signal and are skipped — a query
 * made only of operators keeps the plain due-date ordering it always had.
 */
export function searchRank(w: DeckWord, query: string): number {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    .filter(t => !t.startsWith('is:') && !/^(lapses|reviews)(>=|<=|>|<|=)\d+$/.test(t));
  if (terms.length === 0) return 0;

  const head = deaccent(w.h.toLowerCase());
  const reading = deaccent((w.p ?? '').toLowerCase());
  const meaning = deaccent((w.m ?? '').toLowerCase());

  let best = 0;
  for (const raw of terms) {
    const t = deaccent(raw);
    // The word itself outranks anything it merely appears inside: `no` beats `noroeste`.
    const score =
      head === t                                        ? 100
      : head.startsWith(t)                              ? 70
      : reading === t                                   ? 60
      : new RegExp(`(^|[^a-z])${escapeRe(t)}([^a-z]|$)`).test(meaning) ? 40  // a whole word in the gloss
      : head.includes(t)                                ? 25
      : meaning.includes(t) || reading.includes(t)      ? 10
      : 0;
    best = Math.max(best, score);
  }
  return best;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
