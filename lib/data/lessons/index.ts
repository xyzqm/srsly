import type { LanguageCode } from '@/lib/types';
import type { Lesson } from '@/lib/lessons';
import { FR_LESSONS } from './fr';
import { ES_LESSONS } from './es';
import { ZH_LESSONS } from './zh';
import { JA_LESSONS } from './ja';
import { LESSON_PRACTICE } from '../lesson-practice';

/**
 * The lesson prose, kept BEHIND its own module.
 *
 * Nothing that renders on every screen may import this. `lib/lessons.ts` answers "does this
 * language have lessons?" from a list of codes precisely so `TabNav` never reaches the data —
 * see the note there. Only `components/learn/LearnTab.tsx` imports this, and that component is
 * itself lazily loaded, so the whole tree costs nothing until someone opens the tab.
 */
const LESSONS: Partial<Record<LanguageCode, Lesson[]>> = {
  fr: FR_LESSONS, es: ES_LESSONS, zh: ZH_LESSONS, ja: JA_LESSONS,
};

/**
 * The practice sentences are attached HERE rather than written into the four lesson files.
 *
 * They are the one part of a lesson that is generated: the prose, the examples and the tables
 * are authored, but a practice sentence needs TILES, and tiles have to be cut by the real
 * segmenter so a puzzle's pieces fall where the reader's own word boundaries do — every
 * segmenter in this app is server-side, so the Learn tab cannot cut them itself. Sentences are
 * written in `scripts/data/lesson-practice.json` and `npm run build:practice` emits the cut
 * ones. Keeping generated data out of a hand-edited file is the same split the dictionaries
 * and level tables already use.
 *
 * A lesson with no entry keeps `practice: undefined`, and `lib/lessonPractice.ts` falls back
 * to its examples — degraded, not broken.
 */
const merged = new Map<LanguageCode, Lesson[]>();

export function lessonsFor(lang: LanguageCode): Lesson[] {
  const cached = merged.get(lang);
  if (cached) return cached;
  const base = LESSONS[lang] ?? [];
  const practice = LESSON_PRACTICE[lang] ?? {};
  // Memoised because the identity of these objects is load-bearing: `nextGrammarLesson`
  // returns one and callers compare it against the array they were given.
  const out = base.map(l => (practice[l.id]?.length ? { ...l, practice: practice[l.id] } : l));
  merged.set(lang, out);
  return out;
}
