import type { DailyContent, ShelfEntry, ClozeOccurrenceMap, LanguageCode } from './types';
import { getLanguageConfig } from './languageConfig';
import { tokensToText } from './tokenText';

/**
 * The passage shelf — everything you've actually read, kept.
 *
 * Every generated passage was already cached for a day and then deleted by the prune in
 * saveDailyContent. This keeps the ones you finished. After a couple of months it is the
 * only artifact in the app that shows the shape of the work rather than a number: a list
 * of real texts you got through, with the date and how many blanks you filled first try.
 *
 * WHAT IS STORED, AND WHY NOT THE WHOLE THING
 * A DailyContent holds token arrays — every word carrying its reading, gloss, type and
 * base form. Keeping those forever is how you exhaust a 5 MB localStorage budget in a
 * year. A shelf entry keeps the PLAIN TEXT plus the metadata that can't be recomputed
 * (date, level, target words, score). That is roughly 40× smaller and is enough to
 * re-read, which is the point; what it gives up is per-word tap-to-look-up on an old
 * passage, and that is the right thing to trade.
 *
 * Entries are capped at MAX_ENTRIES per language, oldest dropped first, so the shelf can
 * never grow without bound no matter how long the app is used.
 */

/** Per language. At ~700 bytes an entry this is well under 200 kB even when full. */
export const MAX_ENTRIES = 200;

/** Reconstruct "${date}|${language}|${level}", the key ReadTab stores its per-day state under. */
export function contentKeyOf(content: DailyContent): string {
  return `${content.date}|${content.language ?? 'zh'}|${content.hskLevel}`;
}

/** Blanks answered right on the FIRST try, matching the definition AccuracyTrend uses. */
export function scoreCloze(state: ClozeOccurrenceMap | null): { correct: number; total: number } | undefined {
  if (!state) return undefined;
  const entries = Object.values(state);
  if (entries.length === 0) return undefined;
  return { correct: entries.filter(e => e.grade >= 3).length, total: entries.length };
}

/**
 * Which words were right and which were missed, collapsed to one row per word.
 *
 * A word blanked several times keeps the WORST outcome: getting it once and missing it
 * twice is not a word you knew, and the shelf exists to be looked back at.
 */
export function resultsCloze(state: ClozeOccurrenceMap | null): { word: string; correct: boolean }[] | undefined {
  if (!state) return undefined;
  const byWord = new Map<string, boolean>();
  for (const e of Object.values(state)) {
    const ok = e.grade >= 3;
    byWord.set(e.word, (byWord.get(e.word) ?? true) && ok);
  }
  return byWord.size > 0 ? [...byWord].map(([word, correct]) => ({ word, correct })) : undefined;
}

/**
 * Turn one day's content into shelf entries — only for passages actually finished.
 *
 * `wasRead` answers "did the learner finish passage N", and `clozeFor` supplies its blank
 * grades; both are injected so this stays a pure function over storage the caller owns.
 * Shelving everything generated instead would fill the shelf with passages nobody opened,
 * which makes it a log of what the API produced rather than a record of what you read.
 */
export function entriesFrom(
  content: DailyContent,
  wasRead: (passageIdx: number) => boolean,
  clozeFor: (passageIdx: number) => ClozeOccurrenceMap | null,
): ShelfEntry[] {
  const language = content.language ?? 'zh';
  const out: ShelfEntry[] = [];

  content.passages.forEach((p, i) => {
    if (!wasRead(i)) return;
    const text = p.sentences.map(s => s.plainText).join(' ').trim();
    if (!text) return;
    out.push({
      id: `${content.date}|${language}|${content.hskLevel}|${i}`,
      date: content.date,
      language,
      level: content.hskLevel,
      // Same rule as the body: a local join renders "Undíasoleado" in every spaced language.
      title: tokensToText(p.titleTokens, getLanguageConfig(language).scriptIsUnspaced).trim(),
      text,
      // Tokens as well as text: the text is what older entries have and what a search would
      // scan, the tokens are what the shelf actually renders. See ShelfEntry.sentences.
      sentences: p.sentences,
      vocabWords: p.vocabWords ?? [],
      score: scoreCloze(clozeFor(i)),
      results: resultsCloze(clozeFor(i)),
    });
  });

  return out;
}

/**
 * Merge new entries into the shelf: newest first, deduped by id, capped.
 *
 * Dedup by id rather than by position because a passage can be re-shelved — a day's
 * content is saved several times as sections generate lazily, and the prune runs on each.
 * The incoming copy wins, since it carries the newer score.
 */
export function mergeShelf(existing: ShelfEntry[], incoming: ShelfEntry[]): ShelfEntry[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map(e => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()]
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)))
    .slice(0, MAX_ENTRIES);
}

/** Reading-time estimate. Unspaced scripts are counted in characters, not words. */
export function countWords(text: string, scriptIsUnspaced: boolean): number {
  return scriptIsUnspaced
    ? [...text.replace(/\s+/g, '')].length
    : text.split(/\s+/).filter(Boolean).length;
}

/**
 * How long an entry is, in that language's own unit.
 *
 * An `own` entry keeps no text — see `ShelfEntry.kind` — so it carries the count instead, and
 * this prefers it. ONE counting rule either way: `countWords` is what measures a generated
 * entry here and what measured an own entry when it was shelved, so the two can never disagree
 * about what a word is.
 */
export function lengthOf(entry: ShelfEntry, scriptIsUnspaced: boolean): number {
  if (typeof entry.words === 'number') return entry.words;
  return countWords(entry.text, scriptIsUnspaced);
}

/**
 * A citation for reading the learner brought, carrying NO text and NO tokens.
 *
 * `id` is derived from the day, the language, the title and the length rather than from a
 * passage index, because an index shifts as passages are added and a shifting id turns a
 * re-mark into a duplicate. Two different articles of identical title and length on one day
 * collide, which resolves as "replaces" rather than as corruption — an acceptable trade for an
 * id that is stable across the thing that actually moves.
 */
export function ownEntry(opts: {
  date: string; language: LanguageCode; level: number; title: string;
  plainText: string; scriptIsUnspaced: boolean;
}): ShelfEntry {
  const title = opts.title.trim() || 'Untitled';
  const words = countWords(opts.plainText, opts.scriptIsUnspaced);
  return {
    id: `own|${opts.date}|${opts.language}|${title.slice(0, 60)}|${words}`,
    date: opts.date,
    language: opts.language,
    level: opts.level,
    title,
    text: '',            // deliberately empty — see ShelfEntry.kind
    vocabWords: [],      // own reading carries no contract and no targets
    kind: 'own',
    words,
  };
}

/**
 * REMOVING A PASSAGE FROM THE SHELF, AND WHY IT NEEDS A TOMBSTONE.
 *
 * `saveShelf` writes the array it is given, so dropping an entry and saving is enough — for
 * every entry except the ones that can be DERIVED AGAIN. `LocalStorage.saveDailyContent`
 * rebuilds the day's entries from the cached content on every save (`entriesFrom`, then
 * `mergeShelf`), which is right for shelving and fatal for deleting: remove today's passage,
 * read one more section, and it is back. A union cannot express a removal — the same reason
 * `srsly-lessons-done` merges last-writer-wins rather than as a union, since a union would
 * make un-ticking impossible.
 *
 * So a removal is recorded as an id that must not be re-derived. The list is **device-local**
 * (`srsly-shelf-removed-{lang}`), which is a real limitation stated plainly rather than hidden:
 * deleting on a laptop does not delete on a phone, because the shelf column syncs and this
 * does not. Making it sync is a schema decision and is deliberately not taken here.
 *
 * It is pruned against the shelf it is given, so it cannot grow without bound: once an id is
 * gone from the content cache there is nothing left to suppress and the tombstone is dropped.
 */
const REMOVED_KEY = (lang: LanguageCode) => `srsly-shelf-removed-${lang}`;

export function loadRemoved(lang: LanguageCode): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(REMOVED_KEY(lang));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();          // a corrupt value is not worth throwing over
  }
}

export function saveRemoved(lang: LanguageCode, ids: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(REMOVED_KEY(lang), JSON.stringify([...ids])); }
  catch { /* quota — the worst case is a deleted passage reappearing */ }
}

/** The shelf with `id` gone, and the tombstone that keeps it gone. Pure; the caller persists. */
export function removeEntry(
  entries: ShelfEntry[],
  id: string,
  removed: Set<string>,
): { entries: ShelfEntry[]; removed: Set<string> } {
  const next = entries.filter(e => e.id !== id);
  if (next.length === entries.length) return { entries, removed };   // nothing matched
  return { entries: next, removed: new Set([...removed, id]) };
}

/** Drop anything the tombstone list names. Applied wherever entries are re-derived. */
export function withoutRemoved(entries: ShelfEntry[], removed: Set<string>): ShelfEntry[] {
  return removed.size === 0 ? entries : entries.filter(e => !removed.has(e.id));
}
