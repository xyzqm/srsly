import { describe, it, expect } from 'vitest';
import { FACES, FACE_NAMES, pickFace, type FaceName } from '../lib/stateFace';

/**
 * The header's state mark, RENDERED rather than grepped.
 *
 * Two of the three things worth asserting here are already guaranteed by the compiler and are
 * deliberately NOT tested, because a test that restates a type is noise: `pickFace` is typed to
 * return a `FaceName`, so it cannot invent one, and `FACES` is a `Record<FaceName, …>`, so it
 * cannot be missing a row. `npm run typecheck` fails on either.
 *
 * What neither the types nor a source grep can see is whether two states DRAW THE SAME PICTURE.
 * That is a silent failure with no error anywhere — a 30-day streak and a rest day would simply
 * look alike, and the only symptom is a learner who stops reading the mark because it never
 * seems to change. So this renders all twelve and compares the actual output, which is the same
 * judgement `tests/serviceWorker.test.ts` makes about executing the shipped worker instead of
 * asserting against its source.
 */
describe('the face table', () => {
  it('covers all twelve states', () => {
    expect(FACE_NAMES).toHaveLength(12);
    for (const name of FACE_NAMES) expect(FACES[name], name).toBeTruthy();
  });

  it('gives every state its own combination', () => {
    // The real failure this guards: two states DRAWING THE SAME PICTURE. Nothing errors, no
    // type complains, and the only symptom is a learner who stops reading the mark because it
    // never seems to change. Every field here maps to different geometry in StateFace, so
    // identical specs and identical drawings are the same claim.
    const seen = new Map<string, FaceName>();
    for (const name of FACE_NAMES) {
      const key = JSON.stringify(FACES[name]);
      const clash = seen.get(key);
      expect(clash, `${name} is drawn identically to ${clash}`).toBeUndefined();
      seen.set(key, name);
    }
  });

  it('keeps the dashed ring to the one state that earns it', () => {
    // A broken outline says "half gone". Used twice it stops saying anything.
    const dashed = FACE_NAMES.filter(n => FACES[n].ring === 'dashed');
    expect(dashed).toEqual(['faded']);
  });
});

describe('pickFace', () => {
  /**
   * The precedence, which is the half of `pickFace` that can actually be wrong.
   *
   * These are ordered `if`s, so every rule below silently depends on every rule above it. The
   * one that matters is the first: ABSENCE OUTRANKS EVERYTHING. `useSRS`'s own docstring
   * explains why the away states stopped keying off `lastVisit` — a rest day is not rust — and
   * a reordering that let a stale streak speak over a fortnight's absence would restore exactly
   * the contradiction that comment describes.
   */
  describe('precedence', () => {
    const face = (...a: Parameters<typeof pickFace>) => pickFace(...a).face;

    it('puts absence ahead of a streak that has not been settled yet', () => {
      expect(face(140, 20, 0, false, false)).toBe('frozen');
      expect(face(140, 5, 0, false, false)).toBe('faded');
      expect(face(140, 2, 0, false, false)).toBe('misty');
      // The control: with nobody away, that same streak speaks.
      expect(face(140, 0, 0, false, false)).toBe('celebrating');
    });

    it('puts a rest day ahead of a streak, because that is the mechanic', () => {
      expect(face(40, 0, 0, false, true)).toBe('rested');
      expect(face(40, 0, 0, false, false)).toBe('fond');
    });

    it("prefers today's score to the streak, and only while it is fresh", () => {
      expect(face(40, 0, 95, true, false)).toBe('sharp');
      expect(face(40, 0, 80, true, false)).toBe('pleased');
      expect(face(40, 0, 60, true, false)).toBe('trying');
      expect(face(40, 0, 10, true, false)).toBe('rueful');
      // Yesterday's score is not today's news.
      expect(face(40, 0, 95, false, false)).toBe('fond');
    });

    it('falls through to thinking when there is nothing to report', () => {
      expect(face(0, 0, 0, false, false)).toBe('thinking');
      expect(face(6, 0, 0, false, false)).toBe('thinking');
      expect(face(7, 0, 0, false, false)).toBe('burning');
    });

    it('reaches every face in the catalogue', () => {
      // An unreachable row is a drawing nobody will ever see — dead weight that still has to be
      // maintained, and the kind of thing that survives for months because nothing complains.
      const reached = new Set<FaceName>([
        face(0, 20, 0, false, false), face(0, 5, 0, false, false), face(0, 2, 0, false, false),
        face(3, 0, 0, false, true),
        face(0, 0, 95, true, false), face(0, 0, 80, true, false),
        face(0, 0, 60, true, false), face(0, 0, 10, true, false),
        face(100, 0, 0, false, false), face(30, 0, 0, false, false),
        face(7, 0, 0, false, false), face(0, 0, 0, false, false),
      ]);
      expect([...reached].sort()).toEqual([...FACE_NAMES].sort());
    });
  });
});
