/**
 * THE UNIT PATH IS AUTHORED, SO IT IS EXACTLY THE KIND OF THING A TEST HAS TO HOLD.
 *
 * `lib/data/lessons/units.ts` names 188 lesson ids by hand across four languages. Every one of
 * the failures that costs is silent in the UI: a typo'd id renders as a missing row, a lesson
 * named twice renders twice and counts twice in its unit's progress, and a lesson named in NO
 * unit disappears from the course entirely while still existing, still being counted by
 * `lessonsFor`, and still being reachable by nothing.
 *
 * The ordering assertion is the one with content. The old tree's rule — every grammar lesson
 * before every word set — was a proxy for the real constraint, which is that GRAMMAR BUILDS ON
 * ITSELF: the passé composé cannot be explained to somebody who has not met a participle. The
 * unit path interleaves word sets, so that proxy no longer applies, and the constraint it stood
 * for is asserted directly instead — grammar keeps its relative order wherever the units put it.
 */
import { describe, it, expect } from 'vitest';
import { LESSON_LANGUAGES, grammarLessons, LESSON_COUNT, courseProgress } from '@/lib/lessons';
import { lessonsFor } from '@/lib/data/lessons';
import { unitsFor } from '@/lib/data/lessons/units';
import { UNIT_LESSONS } from '@/lib/lessonUnitIds';
import { countCompletedUnits } from '@/lib/achievements';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('every language with a tree has a unit path', () => {
  it('covers all four', () => {
    for (const lang of LESSON_LANGUAGES) expect(unitsFor(lang).length, lang).toBeGreaterThan(0);
  });
});

for (const lang of LESSON_LANGUAGES) {
  describe(`${lang}: the unit path`, () => {
    const lessons = lessonsFor(lang);
    const units = unitsFor(lang);
    const flat = units.flatMap(u => u.lessons);

    it('names only lessons that exist', () => {
      const known = new Set(lessons.map(l => l.id));
      expect(flat.filter(id => !known.has(id))).toEqual([]);
    });

    it('puts every lesson in exactly one unit', () => {
      // Both directions. A missing lesson is unreachable in the UI; a duplicated one is
      // counted twice by its unit's own progress ring, which is how "4 / 5" sticks at 5 / 5
      // with something still unread.
      expect([...flat].sort()).toEqual(lessons.map(l => l.id).sort());
      expect(new Set(flat).size).toBe(flat.length);
    });

    it('keeps the grammar track in its authored order', () => {
      // The real prerequisite rule. Word sets may land anywhere — they have no dependency on
      // each other — but a grammar lesson may never be moved ahead of one it was written to
      // follow, whatever unit it ends up in.
      const order = grammarLessons(lessons).map(l => l.id);
      const asPathed = flat.filter(id => order.includes(id));
      expect(asPathed).toEqual(order);
    });

    it('takes grammar in contiguous runs rather than scattering it', () => {
      // A unit is meant to be one coherent step. Grammar lessons from three different parts of
      // the track in one unit would pass the ordering test above and still be an incoherent
      // lesson — so each unit's grammar must be a single unbroken run of the track.
      const order = grammarLessons(lessons).map(l => l.id);
      for (const u of units) {
        const idx = u.lessons.filter(id => order.includes(id)).map(id => order.indexOf(id));
        if (idx.length < 2) continue;
        expect(idx.map((n, i) => n - idx[0] - i), `${u.id} grammar is not contiguous`)
          .toEqual(idx.map(() => 0));
      }
    });

    it('opens on a word set, because a rule needs words to be about', () => {
      // The pedagogical reason the split was replaced: "Every noun has a gender" was lesson one
      // for somebody with no nouns. The first thing in the course is vocabulary, in every tree.
      const first = lessons.find(l => l.id === units[0].lessons[0]);
      expect(first?.kind, `${lang} opens on ${units[0].lessons[0]}`).toBe('vocab');
    });

    it('gives every unit a title, a blurb and a workable size', () => {
      for (const u of units) {
        expect(u.title.length, u.id).toBeGreaterThan(2);
        expect(u.blurb.length, u.id).toBeGreaterThan(10);
        // Small enough to finish — the whole reason a unit's progress ring means anything.
        expect(u.lessons.length, u.id).toBeGreaterThanOrEqual(3);
        expect(u.lessons.length, u.id).toBeLessThanOrEqual(7);
      }
    });

    it('has unit ids unique within the language', () => {
      expect(new Set(units.map(u => u.id)).size).toBe(units.length);
    });

    it('mixes both kinds in most units, which is the point of interleaving', () => {
      const byId = new Map(lessons.map(l => [l.id, l]));
      const mixed = units.filter(u => {
        const kinds = new Set(u.lessons.map(id => byId.get(id)?.kind));
        return kinds.size > 1;
      });
      expect(mixed.length / units.length).toBeGreaterThan(0.75);
    });
  });
}

describe('unit ids are unique across every language', () => {
  it('never reuses one between trees', () => {
    const all = LESSON_LANGUAGES.flatMap(l => unitsFor(l).map(u => u.id));
    expect(new Set(all).size).toBe(all.length);
  });
});

/**
 * `LESSON_COUNT` IS A SECOND RECORD OF SOMETHING DERIVABLE, AND IT IS ONLY ALLOWED BECAUSE
 * THIS TEST EXISTS.
 *
 * This repo's first design rule is to store only what cannot be derived, and a lesson count is
 * plainly derivable from the lessons. It is duplicated anyway, for the one reason the rule
 * admits: `lib/lessons.ts` is imported by `TabNav`, which renders on every screen, so deriving
 * it there would pull the whole tree into the landing bundle. The duplication is therefore
 * pinned in BOTH directions rather than trusted.
 */
describe('the lesson count table cannot drift from the lessons', () => {
  it('matches the real tree, language by language', () => {
    for (const lang of LESSON_LANGUAGES) {
      expect(LESSON_COUNT[lang], `${lang}: add a lesson, update LESSON_COUNT`)
        .toBe(lessonsFor(lang).length);
    }
  });

  it('names exactly the languages that have a tree', () => {
    // The other direction: a language added to one and not the other reads as a course with
    // no lessons, or a tree Home cannot count.
    expect(Object.keys(LESSON_COUNT).sort()).toEqual([...LESSON_LANGUAGES].sort());
  });

  it('counts only the language asked for', () => {
    // `srsly-lessons-done` is ONE flat list across every language studied, so a Spanish
    // progress line that counted French ids would read past 100%. The control is a done-set
    // holding another tree's ids.
    const mixed = new Set(['es-gender', 'es-plural', 'fr-etre', 'fr-avoir', 'zh-de']);
    expect(courseProgress('es', mixed).done).toBe(2);
    expect(courseProgress('fr', mixed).done).toBe(2);
    expect(courseProgress('es', mixed).total).toBe(lessonsFor('es').length);
  });
});

/**
 * THE SPLIT BETWEEN PROSE AND IDS MUST NOT DRIFT.
 *
 * `lib/lessonUnitIds.ts` holds which lessons are in which unit; `units.ts` holds each unit's
 * title. They are two files by WEIGHT — achievements need the ids at the app root and must not
 * drag the titles there — but they describe one thing, and `unitsFor` DROPS a unit whose id has
 * no lessons. That drop is the right runtime behaviour and the wrong thing to discover in
 * production: a renamed unit id would silently remove a unit from the course.
 */
describe('the unit id map and the unit prose name the same units', () => {
  it('matches in both directions, per language', () => {
    for (const lang of LESSON_LANGUAGES) {
      const fromIds = Object.keys(UNIT_LESSONS[lang] ?? {}).sort();
      const fromText = unitsFor(lang).map(u => u.id).sort();
      expect(fromText, `${lang}: a unit has a title but no lessons, or lessons but no title`)
        .toEqual(fromIds);
    }
  });

  it('keeps the ids in exactly one place', () => {
    // The whole point of the split. If units.ts ever grew its own `lessons:` arrays again,
    // the two copies would drift the first time one was edited alone.
    const src = readFileSync(resolve(__dirname, '../lib/data/lessons/units.ts'), 'utf8');
    expect(src).not.toMatch(/lessons:\s*\[\s*'/);
  });
});

/**
 * UNIT COMPLETION IS DERIVED, AND THE VACUOUS CASE IS THE ONE THAT BITES.
 *
 * `every()` on an empty array is TRUE, so a unit whose id lost its lesson list would count as
 * finished for everybody — handing out every course badge at once, to a learner who has opened
 * nothing. That is the failure mode worth a control, because it fires on data that looks fine.
 */
describe('counting finished units', () => {
  const es = UNIT_LESSONS.es!;
  const u1 = es['es-u1'];

  it('counts a unit only when every one of its lessons is done', () => {
    expect(countCompletedUnits(u1.slice(0, -1))).toBe(0);
    expect(countCompletedUnits(u1)).toBe(1);
  });

  it('counts across languages, because the badge is not per language', () => {
    const both = [...u1, ...UNIT_LESSONS.fr!['fr-u1']];
    expect(countCompletedUnits(both)).toBe(2);
  });

  it('is zero for an empty done-list', () => {
    expect(countCompletedUnits([])).toBe(0);
  });

  it('ignores ids that belong to no unit', () => {
    expect(countCompletedUnits(['not-a-lesson', 'es-nope'])).toBe(0);
  });

  it('never counts a unit with no lessons — the vacuous-truth control', () => {
    // every() on [] is true. Proven against the real function by passing a done-list that
    // completes nothing: if an empty unit existed it would be counted here.
    const sizes = Object.values(UNIT_LESSONS).flatMap(byUnit =>
      Object.values(byUnit ?? {}).map(l => l.length));
    expect(Math.min(...sizes), 'a unit with no lessons would be "finished" by everybody')
      .toBeGreaterThan(0);
    expect(countCompletedUnits(['nothing-at-all'])).toBe(0);
  });
});
