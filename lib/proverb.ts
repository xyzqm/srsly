import type { LanguageCode } from './types';

/**
 * One idiom a day, chosen — not fetched.
 *
 * NO API CALL AND NOTHING TO CACHE. The obvious shape for a "daily X" is to generate it and
 * cache the result by date so reloads don't spend credits twice, which is what the daily
 * passage does. That is the right pattern when the content has to be written for you. It is
 * the wrong one here: idioms are a fixed, finite set that CC-CEDICT already ships with
 * definitions, so the day's proverb can be a pure function of the date. Nothing is
 * generated, so nothing can be double-generated, and a cache would just be a slower way of
 * computing an index. It also cannot hallucinate a chengyu that does not exist, cannot fail
 * offline, and costs nothing for a user whose generation budget is spent.
 */

export interface Proverb {
  /** The idiom itself. */
  t: string;
  /** Reading — pinyin or kana. Empty for Spanish and French. */
  r?: string;
  /** What it means. */
  m: string;
  /** The literal image, when it differs from the meaning enough to be worth showing. */
  l?: string;
  /** Chinese only: 0 = the canon (idioms that are HSK vocabulary), 1–6 = hardest character. */
  lv?: number;
}

let cache: Record<string, Proverb[]> | null = null;
let loading: Promise<Record<string, Proverb[]> | null> | null = null;

/** Dynamically imported like every other generated table — 3,760 Chinese entries. */
export async function loadProverbs(): Promise<Record<string, Proverb[]> | null> {
  if (cache) return cache;
  if (!loading) {
    loading = import('./data/proverbs')
      .then(m => { cache = m.PROVERBS as Record<string, Proverb[]>; return cache; })
      .catch(() => { loading = null; return null; });
  }
  return loading;
}

/** Whole days since the epoch, in LOCAL time — the same day boundary the rest of the app uses. */
function dayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
}

const START_KEY = 'srsly-proverb-day-one';

/**
 * The day the learner first saw this, so the walk can start at the top of the list.
 *
 * NOT a cache of content — it holds a date, and the proverb is still computed. The list is
 * sorted canon-first (Chinese opens on 一丝不苟, 一举两得, 一如既往), and counting days from a
 * fixed epoch throws that away: today is day 20,679, so a brand-new learner's first proverb
 * would be whatever sits at index 20679 % 3760. Anchoring to their own first day is what
 * makes "the good ones first" true for everyone rather than for nobody.
 *
 * Device-local on purpose, like `srsly-curriculum-pruned`: it records where this copy of the
 * app is in the sequence, which is not a preference worth syncing.
 */
function dayOne(today: number): number {
  if (typeof localStorage === 'undefined') return today;
  try {
    const saved = parseInt(localStorage.getItem(START_KEY) ?? '', 10);
    if (Number.isFinite(saved)) return saved;
    localStorage.setItem(START_KEY, String(today));
  } catch { /* private mode — the sequence just restarts, which is harmless */ }
  return today;
}

/**
 * The proverb for `date` in `language`.
 *
 * Walks the list in order rather than hashing into it, so a Chinese learner meets the 84
 * canonical idioms first and only then moves into the long tail. A hash would shuffle that
 * ordering away on day one. Wrapping is fine: the shortest list is 20 entries and the
 * longest 3,760, so nothing repeats inside a year except where 20 is genuinely all there is.
 */
export function proverbFor(
  table: Record<string, Proverb[]> | null,
  language: LanguageCode,
  date: Date = new Date(),
): Proverb | null {
  const list = table?.[language];
  if (!list || list.length === 0) return null;
  const today = dayNumber(date);
  const elapsed = today - dayOne(today);
  return list[((elapsed % list.length) + list.length) % list.length];
}
