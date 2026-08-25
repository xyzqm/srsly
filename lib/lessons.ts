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
}

export interface Lesson {
  id: string;
  /** The unit it belongs to, used only to group the list. */
  unit: string;
  kind: 'grammar' | 'vocab';
  title: string;
  /** One line, shown in the list without opening anything. */
  summary: string;
  /** Grammar only: the teaching prose. Blank lines separate paragraphs. */
  explanation?: string;
  /** Grammar only. Validated against the real dictionary — see tests/lessons.test.ts. */
  examples?: LessonExample[];
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

/** The units in order, each with its lessons — the shape the tab renders. */
export function unitsFor(lessons: Lesson[]): { unit: string; lessons: Lesson[] }[] {
  const out: { unit: string; lessons: Lesson[] }[] = [];
  for (const lesson of lessons) {
    const last = out[out.length - 1];
    if (last && last.unit === lesson.unit) last.lessons.push(lesson);
    else out.push({ unit: lesson.unit, lessons: [lesson] });
  }
  return out;
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
