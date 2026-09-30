import type { DeckWord, LanguageCode, ShelfEntry, SRSState } from './types';
import type { DayActivity } from './activityLog';
import { isMastered } from './achievements';
import { lengthOf } from './shelf';
import { getLanguageConfig } from './languageConfig';
import { todayStr } from './deck';

/**
 * A year of reading, derived on read and stored nowhere.
 *
 * ## THE AUDIT IS THE FEATURE
 *
 * The interesting half of this module is the list of things it REFUSES to report, because each
 * refusal is a place where the obvious chart would need a field nobody is keeping:
 *
 * - **Words added per month.** `DeckWord` carries no created-at. Adding one to fill a bar chart
 *   would be a second record of a fact, written on every save, bought to decorate a screen —
 *   the rule this codebase opens with. So the deck contributes a COUNT AT THIS MOMENT (held,
 *   mastered) and never a series.
 * - **Accuracy across the year.** `SRSState.accuracy` is trimmed to a 30-day window, so a
 *   twelve-month line would be one real month and eleven of nothing.
 * - **When a lesson was finished.** `lessons_done` holds ids and nothing else, so lessons are a
 *   total and not a timeline.
 *
 * Everything that IS reported comes from a record that already exists for another reason, which
 * is why this page costs no storage, no column and no migration.
 *
 * ## THE TWO SOURCES HAVE DIFFERENT HORIZONS, AND BOTH SAY SO
 *
 * `activity_log` is pruned to `ACTIVITY_WINDOW_DAYS` (400) — a deletion policy, not a display
 * window, so nothing older can be recovered. It was 120 until 2026-09-29, which means the first
 * genuinely complete year cannot exist before 2027. `firstRecorded` is reported for exactly that
 * reason: a page that implies a year it does not have is a loading state rendered as an answer,
 * and `ReviewHeatmap`'s legend already sets the precedent of naming the day the record starts.
 *
 * The shelf has a different limit — `MAX_ENTRIES` (200) PER LANGUAGE, oldest dropped — so a year
 * of more than 200 finished passages in one language loses its early months. `shelfMayBeClipped`
 * reports when a language is at that cap, so the page can say so rather than quietly undercount.
 * Raising the cap is not the fix: 200 × ~700 B × four languages is already ~560 kB of a 5 MB
 * localStorage budget that also holds every deck.
 */

/** The span a "year" covers. Shorter than `ACTIVITY_WINDOW_DAYS` on purpose — the window keeps
 *  slack so the far end of the year survives; this is the year itself. */
export const YEAR_DAYS = 365;

/**
 * Below this many recorded days the panel does not render at all.
 *
 * NOT a zeroed page. `npm run seed:dev` exists because the Stats panel hides itself on a new
 * account, *because a wall of empty progress bars is a list of things you have failed to do* —
 * and a year-in-review is the worst possible version of that: a retrospective of nothing. Two
 * weeks is the shortest span where "days studied", "longest run" and a monthly shape each say
 * something rather than restating each other.
 */
export const MIN_DAYS_TO_SHOW = 14;

export interface YearMonth {
  /** `YYYY-MM`. */
  month: string;
  cards: number;
  passages: number;
}

export interface YearLanguage {
  language: LanguageCode;
  passages: number;
  wordsRead: number;
}

export interface YearInReading {
  /** The first day the ACTIVITY LOG covers, or null when it covers nothing. Not the first day
   *  the learner studied — nothing knows that once a day has aged out. */
  firstRecorded: string | null;
  through: string;
  daysStudied: number;
  cardsGraded: number;
  busiest: { day: string; n: number } | null;
  /** Longest run of consecutive calendar days with anything graded. */
  longestRun: number;
  /** One entry per calendar month in the window, INCLUDING empty ones — a bar chart that omits
   *  its empty months draws a different shape from the one the year had. */
  months: YearMonth[];
  passages: number;
  wordsRead: number;
  byLanguage: YearLanguage[];
  wordsHeld: number;
  wordsMastered: number;
  lessonsFinished: number;
  /** A language whose shelf is at `MAX_ENTRIES`, so its early passages may be missing. */
  shelfMayBeClipped: LanguageCode[];
  /** Too little recorded to be worth a page. The caller renders NOTHING, not an empty one. */
  sparse: boolean;
}

export interface YearInput {
  log: DayActivity[];
  shelves: Partial<Record<LanguageCode, ShelfEntry[]>>;
  decks: Partial<Record<LanguageCode, DeckWord[]>>;
  srs: SRSState | null;
  lessonsDone: string[];
  /** Injected so the whole thing is a pure function of its inputs and testable without a clock. */
  today?: string;
  /** The per-language shelf cap, so the clipping warning cannot drift from `lib/shelf.ts`. */
  shelfCap: number;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Every `YYYY-MM` from `startIso`'s month through `endIso`'s, inclusive. */
function monthsBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let [y, m] = startIso.split('-').map(Number);
  const [ey, em] = endIso.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/**
 * The longest run of CONSECUTIVE days, which is deliberately not the streak.
 *
 * `SRSState.streak` is the run ending today and is allowed to go down; this is the best run
 * anywhere in the window and only ever describes the past. They are different questions and
 * a retrospective wants the second one — it is the one fact here that a bad week cannot take
 * away, which is the whole reason a look-back is worth reading.
 */
function longestRun(days: string[]): number {
  if (days.length === 0) return 0;
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    run = addDays(days[i - 1], 1) === days[i] ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

export function yearInReading(input: YearInput): YearInReading {
  const through = input.today ?? todayStr();
  const from = addDays(through, -(YEAR_DAYS - 1));

  const inWindow = input.log
    .filter(e => e.d >= from && e.d <= through && e.n > 0)
    .sort((a, b) => a.d.localeCompare(b.d));

  const daysStudied = inWindow.length;
  const cardsGraded = inWindow.reduce((n, e) => n + e.n, 0);
  const busiest = inWindow.reduce<{ day: string; n: number } | null>(
    (best, e) => (best === null || e.n > best.n ? { day: e.d, n: e.n } : best), null);

  const cardsByMonth = new Map<string, number>();
  for (const e of inWindow) cardsByMonth.set(e.d.slice(0, 7), (cardsByMonth.get(e.d.slice(0, 7)) ?? 0) + e.n);

  const passagesByMonth = new Map<string, number>();
  const byLanguage: YearLanguage[] = [];
  const shelfMayBeClipped: LanguageCode[] = [];
  let passages = 0, wordsRead = 0;

  for (const [lang, entries] of Object.entries(input.shelves) as [LanguageCode, ShelfEntry[]][]) {
    if (!entries?.length) continue;
    if (entries.length >= input.shelfCap) shelfMayBeClipped.push(lang);
    const unspaced = getLanguageConfig(lang).scriptIsUnspaced;
    let langPassages = 0, langWords = 0;
    for (const e of entries) {
      if (e.date < from || e.date > through) continue;
      langPassages++;
      // `lengthOf` is the shelf's own measure, so "words read" here and a shelf entry's own
      // length cannot disagree — one fact, one function.
      langWords += lengthOf(e, unspaced);
      passagesByMonth.set(e.date.slice(0, 7), (passagesByMonth.get(e.date.slice(0, 7)) ?? 0) + 1);
    }
    if (langPassages === 0) continue;
    byLanguage.push({ language: lang, passages: langPassages, wordsRead: langWords });
    passages += langPassages;
    wordsRead += langWords;
  }
  byLanguage.sort((a, b) => b.wordsRead - a.wordsRead);

  // The chart starts where the RECORD starts, not a year ago, so a learner of six weeks is not
  // shown ten empty columns and told that is their year.
  const firstRecorded = inWindow.length ? inWindow[0].d : null;
  const chartFrom = firstRecorded ?? through;
  const months: YearMonth[] = monthsBetween(chartFrom.slice(0, 7) + '-01', through).map(month => ({
    month,
    cards: cardsByMonth.get(month) ?? 0,
    passages: passagesByMonth.get(month) ?? 0,
  }));

  const allWords = Object.values(input.decks).flat().filter((w): w is DeckWord => !!w);

  return {
    firstRecorded,
    through,
    daysStudied,
    cardsGraded,
    busiest,
    longestRun: longestRun(inWindow.map(e => e.d)),
    months,
    passages,
    wordsRead,
    byLanguage,
    wordsHeld: allWords.length,
    wordsMastered: allWords.filter(isMastered).length,
    lessonsFinished: input.lessonsDone.length,
    shelfMayBeClipped,
    sparse: daysStudied < MIN_DAYS_TO_SHOW,
  };
}
