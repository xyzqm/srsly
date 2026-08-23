import type { LanguageCode } from '@/lib/types';
import type { Lesson } from '@/lib/lessons';
import { FR_LESSONS } from './fr';

/**
 * The lesson prose, kept BEHIND its own module.
 *
 * Nothing that renders on every screen may import this. `lib/lessons.ts` answers "does this
 * language have lessons?" from a list of codes precisely so `TabNav` never reaches the data —
 * see the note there. Only `components/learn/LearnTab.tsx` imports this, and that component is
 * itself lazily loaded, so the whole tree costs nothing until someone opens the tab.
 */
const LESSONS: Partial<Record<LanguageCode, Lesson[]>> = { fr: FR_LESSONS };

export function lessonsFor(lang: LanguageCode): Lesson[] {
  return LESSONS[lang] ?? [];
}
