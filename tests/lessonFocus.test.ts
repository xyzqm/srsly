/**
 * A FOCUS SET THAT MATCHES NOTHING IS WORSE THAN NO FOCUS SET.
 *
 * `Lesson.focus` names the forms a lesson's rule chooses between, and `buildQuestions` blanks
 * whichever one appears in each practice sentence. The mechanism DEGRADES by design: a
 * sentence containing none of the forms falls back to the ordering question. That is the right
 * behaviour at runtime and a trap at authoring time — a typo'd form, a set written against the
 * wrong lesson, or a form the segmenter splits differently all fail SILENTLY, leaving the
 * lesson on exactly the word-order drill the set was added to replace.
 *
 * So every declared set is required to bite, and the options are held to the properties that
 * make the question answerable by grammar rather than by looking.
 */
import { describe, it, expect } from 'vitest';
import { LESSON_LANGUAGES, grammarLessons } from '@/lib/lessons';
import { lessonsFor } from '@/lib/data/lessons';
import { LESSON_FOCUS } from '@/lib/data/lessons/focus';
import { buildQuestions, bareWord } from '@/lib/lessonPractice';

const fixed = () => 0.5;

describe('the focus sets are attached and reachable', () => {
  it('names only lessons that exist, and only grammar ones', () => {
    for (const lang of LESSON_LANGUAGES) {
      const grammar = new Set(grammarLessons(lessonsFor(lang)).map(l => l.id));
      for (const id of Object.keys(LESSON_FOCUS[lang] ?? {})) {
        expect(grammar.has(id), `${id} is not a grammar lesson in ${lang}`).toBe(true);
      }
    }
  });

  it('reaches the lesson objects through lessonsFor', () => {
    // The attachment in lib/data/lessons/index.ts is the half that can silently regress: the
    // data can be perfect and simply never reach a Lesson.
    const es = lessonsFor('es').find(l => l.id === 'es-gender');
    expect(es?.focus).toEqual(['el', 'la']);
  });
});

for (const lang of LESSON_LANGUAGES) {
  const declared = LESSON_FOCUS[lang] ?? {};
  if (!Object.keys(declared).length) continue;

  describe(`${lang}: every focus set bites`, () => {
    const lessons = lessonsFor(lang);

    for (const id of Object.keys(declared)) {
      const lesson = lessons.find(l => l.id === id)!;

      it(`${id} asks about its own forms`, () => {
        const qs = buildQuestions(lesson, fixed);
        // Only the focus-derived ones: a lesson with a focus set can still produce a
        // length-based choice for a sentence too short to order, and that one blanks a random
        // word by design. `via` is what keeps the two apart.
        const choices = qs.filter(q => q.kind === 'choice' && q.via === 'focus');
        expect(choices.length, `${id}: no sentence contains any of ${declared[id].join('/')}`)
          .toBeGreaterThan(0);

        for (const q of choices) {
          if (q.kind !== 'choice') continue;
          // The answer is one of the lesson's forms, not some other word of the sentence.
          // Compared bare, because a sentence-final blank carries the punctuation with it.
          expect(declared[id].map(f => f.toLowerCase()))
            .toContain(bareWord(q.answer).toLowerCase());
          // A gap with one button under it gives more away than printing the answer.
          expect(q.options.length, `${id}: only one option`).toBeGreaterThanOrEqual(2);
          expect(q.options).toContain(q.answer);
          // ⚠ CAPITALISATION MUST NOT SORT THE ANSWER OUT OF THE LIST. Sentences are
          // capitalised, so blanking `El` and offering `El / la / los` marks the answer for
          // anyone who has ever seen a sentence. Every option wears the same case.
          const caps = q.options.map(o => o[0] === o[0].toUpperCase() && o[0] !== o[0].toLowerCase());
          expect(new Set(caps).size, `${id}: mixed capitalisation in ${q.options.join('/')}`).toBe(1);
          // ⚠ AND THE PUNCTUATION IS CONSTANT ACROSS THE LIST. A sentence-final particle is
          // final by definition — zh-ne-ba and ja-aru-iru are nothing but — so the blank is
          // allowed to take the last tile, and what makes that fair is that every option
          // wears the same mark. One option ending in ？ among three that do not is the
          // answer, printed.
          const marks = new Set(q.options.map(o => o.slice(bareWord(o).length)));
          expect(marks.size, `${id}: options disagree about punctuation`).toBe(1);
        }
      });
    }
  });
}

describe('the drill as a whole', () => {
  it('no longer asks only about word order', () => {
    // The measurement that started this: 297 of 323 questions were ordering, and 94 of 104
    // grammar lessons asked nothing else. Pinned as a ratio rather than a count so adding a
    // lesson does not fail it, and asserted at BOTH ends — a drill that became all choice
    // would have thrown away the lessons where rebuilding is the right question.
    let order = 0, choice = 0, accent = 0;
    for (const lang of LESSON_LANGUAGES) {
      for (const l of grammarLessons(lessonsFor(lang))) {
        for (const q of buildQuestions(l, fixed)) {
          if (q.kind === 'order') order++;
          else if (q.kind === 'choice') choice++;
          else accent++;
        }
      }
    }
    const total = order + choice + accent;
    expect(order / total, 'ordering has taken the drill back over').toBeLessThan(0.75);
    expect(choice / total, 'the focus questions stopped firing').toBeGreaterThan(0.15);
    expect(order, 'word-order lessons still need the ordering question').toBeGreaterThan(0);
  });
});
