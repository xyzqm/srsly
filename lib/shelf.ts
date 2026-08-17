import type { DailyContent, ShelfEntry, ClozeOccurrenceMap } from './types';
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
export function lengthOf(entry: ShelfEntry, scriptIsUnspaced: boolean): number {
  return scriptIsUnspaced
    ? [...entry.text.replace(/\s+/g, '')].length
    : entry.text.split(/\s+/).filter(Boolean).length;
}
