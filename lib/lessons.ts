/**
 * The lesson tree: a route in for someone who wants one.
 *
 * ── ORDERED, NEVER LOCKED ──
 * This app's position is that levels are calibration and a map, NOT the goal — pasted text,
 * EPUBs and your own books ignore them entirely, and Settings says so in as many words. A
 * lesson tree pulls the other way, and the resolution is that lessons are SEQUENCED but never
 * gate anything. Nothing here is a prerequisite for reading, and every lesson can be opened on
 * day one. If a lesson ever becomes a prerequisite, that decision has been reversed, and it
 * should be reversed knowingly rather than by a `disabled` prop.
 *
 * ── WHY GRAMMAR AT ALL ──
 * srsly taught vocabulary well and grammar not at all. Reading fills the deck and FSRS
 * schedules it, but nothing ever explained why a sentence is SHAPED the way it is.
 * `components/read/GrammarNote.tsx` answers that in passing, one word at a time, while you
 * read; this answers it deliberately, for someone who wants the rule rather than the instance.
 * The two halves are meant to be met in that order — in context first, then here.
 */
import type { LanguageCode } from './types';

export interface LessonExample {
  /** The sentence, as a learner would actually meet it. */
  text: string;
  /** What it MEANS, in plain English — not a word-for-word gloss. */
  gloss: string;
  /**
   * Word tiles for the build-the-sentence exercise, in the CORRECT order; the UI shuffles them.
   *
   * Authored rather than derived, because deriving them would need a segmenter and every
   * segmenter in this app is server-side. Joining them must reproduce `text` exactly — a space
   * between tiles for Spanish and French, nothing for Chinese and Japanese — and
   * `tests/lessons.test.ts` asserts precisely that, so a typo cannot ship as an unsolvable
   * puzzle. Final punctuation rides on the last tile rather than becoming a tile of its own.
   */
  tiles?: string[];
}

/**
 * The enumerable half of a rule, laid out rather than listed in prose.
 *
 * Some rules are a paragraph and some are a table pretending to be one. Measure words,
 * counters, verb endings, which preposition each country takes — these are FINITE SETS, and
 * a learner reading "本 for books, 张 for flat things, 只 for many animals" in running text is
 * doing the work of building the table themselves, from memory, while trying to learn its
 * contents. Prose is the wrong shape for a lookup and the right shape for a why.
 *
 * The FIRST column is target-language and rendered tappable, so every term in it reaches the
 * same definition, audio and Add-to-vocab that a word in a passage does. That is the whole
 * reason the table is data rather than markdown in `explanation`: a string cannot be tapped.
 * `tests/lessons.test.ts` validates that column against the real dictionary exactly as it
 * validates an example sentence.
 */
export interface LessonTable {
  /** What the table answers. One line, above it. */
  caption: string;
  /** Headers. `columns[0]` labels the tappable target-language column. */
  columns: string[];
  /** Cells, in column order. Every row must be `columns.length` long. */
  rows: string[][];
}

export interface Lesson {
  id: string;
  kind: 'grammar' | 'vocab';
  title: string;
  /** One line, shown in the list without opening anything. */
  summary: string;
  /** Grammar only: the teaching prose. Blank lines separate paragraphs. */
  explanation?: string;
  /** Grammar only. Validated against the real dictionary — see tests/lessons.test.ts. */
  examples?: LessonExample[];
  /**
   * Grammar only: the enumerable part of the rule, where there is one.
   *
   * Deliberately not on every lesson. "The verb goes last" has nothing to tabulate, and a
   * two-row table added for consistency is furniture.
   */
  table?: LessonTable;
  /**
   * Grammar only: the mistake beginners actually make, in one or two sentences.
   *
   * A rule stated correctly and a rule stated correctly PLUS the wrong version you were about
   * to produce are not the same lesson. This is the second one, and it is separated from
   * `explanation` rather than buried in it because the error is what the reader needs to
   * recognise later, at speed, in their own sentence — so it gets its own box and its own
   * heading rather than being paragraph four.
   */
  pitfall?: string;
  /**
   * Grammar only: sentences written FOR the exercise, distinct from `examples`.
   *
   * Practice used to be built from the examples, which meant the answer was printed on the
   * screen the learner had just scrolled past — the exercise tested scrollback, not the rule.
   * These are new sentences about the same rule, using vocabulary from the same lessons, and
   * `tests/lessons.test.ts` asserts none of them repeats an example.
   *
   * When absent, `lib/lessonPractice.ts` falls back to `examples`, so a lesson without them
   * is degraded rather than broken.
   */
  practice?: LessonExample[];
  /** Vocabulary only: a theme key from `lib/data/beginner-themes`. */
  theme?: string;
}

/**
 * ALL FOUR LANGUAGES, but they arrived in a deliberate order.
 *
 * French and Spanish came first because a tree that explains the imperfect beside a reader that
 * cannot point one out in the text is half a feature twice — so each got its grammar table
 * first and its lesson tree second.
 *
 * Chinese is the one language that rule does not apply to, and for the same reason it has no
 * table: it does not inflect, so there is no slot for a form to fill and nothing a grammar note
 * could report. Everything a French note would carry is a separate word in Chinese — 了, 的, 把,
 * a measure word — which the reader can already tap. What a dictionary cannot tell them is what
 * those words are FOR, and prose is what does that.
 *
 * Japanese still owes its reader a grammar note: kuromoji resolves 使っています to 使う at
 * segmentation time, but nothing yet says "polite present progressive". That is a third design
 * rather than a third table, so the tree ships first here and the note is still outstanding.
 *
 * ── A LIST OF CODES, NOT THE LESSONS THEMSELVES ──
 * `TabNav` renders on every screen and needs `hasLessons` synchronously to decide whether the
 * tab exists at all. Importing the lesson data here to answer that put 12 kB of French prose
 * in the initial bundle for every learner, including the ones studying Chinese who can never
 * see the tab — the exact failure CLAUDE.md describes for the level tables. The prose lives in
 * lib/data/lessons/index.ts and rides in the Learn tab's own lazily-loaded chunk.
 */
export const LESSON_LANGUAGES: LanguageCode[] = ['fr', 'es', 'zh', 'ja'];

export function hasLessons(lang: LanguageCode): boolean {
  return LESSON_LANGUAGES.includes(lang);
}

/**
 * GRAMMAR IS THE COURSE; WORDS ARE A SHELF.
 *
 * The two kinds are split rather than interleaved, because they are not the same kind of thing.
 * Grammar builds on itself — you cannot explain the passé composé to someone who has not met a
 * participle — so it is one numbered track, in the order it is written, and the number is the
 * whole navigation. Vocabulary sets have no such dependency: nobody needs colours before food.
 * Ordering them would invent a prerequisite that does not exist and make a learner feel behind
 * for opening the one they actually wanted.
 *
 * NUMBERED, STILL NEVER LOCKED. The number is a suggested path, not a gate — see the note at
 * the top of this file. Every lesson opens on day one.
 */
export function grammarLessons(lessons: Lesson[]): Lesson[] {
  return lessons.filter(l => l.kind === 'grammar');
}

export function vocabLessons(lessons: Lesson[]): Lesson[] {
  return lessons.filter(l => l.kind === 'vocab');
}

/** How far along the grammar track the learner is: the first lesson not yet finished. */
export function nextGrammarLesson(lessons: Lesson[], done: Set<string>): Lesson | undefined {
  return grammarLessons(lessons).find(l => !done.has(l.id));
}

/**
 * Which lessons have been finished.
 *
 * The one piece of state here that cannot be derived. Whether a vocabulary lesson's words are
 * in the deck IS derivable, but "I have read this explanation" is not recoverable from
 * anything — so it is stored, and nothing else is.
 *
 * Device-local on purpose, exactly like `srsly-achievements-seen` and
 * `srsly-curriculum-pruned`: it records what has been done on this screen, not a preference
 * worth the sync surface. Re-reading a grammar note on a second device costs nothing.
 */
const KEY = 'srsly-lessons-done';

export function loadDone(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();   // a corrupt value is not worth throwing over — the cost is a re-read
  }
}

export function saveDone(ids: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch { /* quota — the worst case is a lesson that will not stay ticked */ }
}
