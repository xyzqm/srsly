/**
 * WHICH face the header draws. `components/shared/StateFace.tsx` draws it.
 *
 * ⚠ THE TABLE LIVES IN `lib/` SO IT CAN BE TESTED AT ALL, which is the move this codebase has
 * already made once for exactly this reason: `lib/server/generateJson.ts` says the retry loop
 * was pure logic trapped inside an API route, so every claim about it had to be pinned by
 * grepping the route's own source — "which catches a deletion and nothing else". A `.tsx` file
 * is trapped the same way here, because `tsconfig.json` sets `jsx: "preserve"` for Next and
 * vitest therefore cannot parse one. Splitting the SPEC from the DRAWING costs one import and
 * makes the half that can be wrong ordinary data.
 *
 * Nothing here knows what a path looks like. These are the four decisions — ring, eyes, mouth,
 * badge — and the component owns the geometry that renders each one.
 */

/** The twelve states `useSRS` distinguishes, named for what they say rather than how drawn. */
export type FaceName =
  | 'frozen'      // two weeks away or more
  | 'faded'       // four days away
  | 'misty'       // a couple of days away
  | 'rested'      // nothing due, streak safe
  | 'sharp'       // scored 90+ today
  | 'pleased'     // scored 75+
  | 'trying'      // scored 55+
  | 'rueful'      // scored under 55
  | 'celebrating' // 100-day streak
  | 'fond'        // 30-day streak
  | 'burning'     // 7-day streak
  | 'thinking';   // a new day, nothing said yet

export type Eyes = 'dots' | 'closed' | 'dashes' | 'glasses' | 'shades' | 'brow';
export type Mouth = 'smile' | 'grin' | 'flat' | 'wince' | 'pucker' | 'none';
export type Badge = 'none' | 'think' | 'flame' | 'rays' | 'spark' | 'frost' | 'mist' | 'bead';

export interface FaceSpec {
  eyes: Eyes;
  mouth: Mouth;
  badge: Badge;
  ring?: 'dashed';
}

/**
 * ONE PARAMETERISED FACE, NOT TWELVE DRAWINGS.
 *
 * All twelve states still show, but they are COMBINATIONS of a small vocabulary rather than
 * twelve bespoke paths. That is what keeps them looking like one family: a hand-drawn set this
 * size drifts in stroke weight and eye spacing between members, and the drift is obvious
 * precisely because they appear in the same 25px box one after another.
 *
 * `ring: 'dashed'` is used once, for `faded` — four days away is the state where the learner is
 * half gone, and a broken outline says so without a sad face. The emoji it replaces (🫥, a
 * dotted outline) made the same choice.
 */
export const FACES: Record<FaceName, FaceSpec> = {
  frozen:      { eyes: 'dashes',  mouth: 'flat',   badge: 'frost' },
  faded:       { eyes: 'dashes',  mouth: 'flat',   badge: 'none', ring: 'dashed' },
  misty:       { eyes: 'dashes',  mouth: 'none',   badge: 'mist' },
  rested:      { eyes: 'closed',  mouth: 'smile',  badge: 'none' },
  sharp:       { eyes: 'glasses', mouth: 'grin',   badge: 'none' },
  pleased:     { eyes: 'shades',  mouth: 'grin',   badge: 'none' },
  trying:      { eyes: 'dots',    mouth: 'smile',  badge: 'none' },
  rueful:      { eyes: 'dots',    mouth: 'wince',  badge: 'bead' },
  celebrating: { eyes: 'dots',    mouth: 'grin',   badge: 'rays' },
  fond:        { eyes: 'closed',  mouth: 'grin',   badge: 'spark' },
  burning:     { eyes: 'dots',    mouth: 'grin',   badge: 'flame' },
  thinking:    { eyes: 'brow',    mouth: 'pucker', badge: 'think' },
};

export const FACE_NAMES = Object.keys(FACES) as FaceName[];

/**
 * Which face a learner's state asks for.
 *
 * ── `daysAway` IS UNFORGIVEN ABSENCE, NOT DAYS SINCE YOU LAST OPENED THE APP ──
 *
 * These three states used to key off `lastVisit`, which is the one signal the honest streak was
 * written to stop trusting (see lib/streak.ts). The result contradicted itself on screen: three
 * days where FSRS asked for nothing kept the streak alive and intact, and then the header
 * greeted the learner with "Getting rusty — let's shake it off!" for obeying the schedule. A
 * rest day is not rust, and a visit is not study.
 *
 * `restToday` is the other half: today is asking nothing of you and your streak is safe. Saying
 * so is the point of the mechanic — silence would only mean the app has stopped contradicting
 * itself.
 *
 * ⚠ THESE ARE ORDERED `if`s, SO EVERY RULE DEPENDS ON EVERY RULE ABOVE IT. Absence outranks
 * everything, then a rest day, then today's score, then the streak. Reordering so a stale
 * streak speaks over a fortnight's absence restores exactly the contradiction described above,
 * and nothing would report it — the header would simply be wrong. `tests/stateFace.test.ts`
 * pins each boundary with the control on the other side of it.
 */
export function pickFace(
  streak: number,
  daysAway: number,
  todayScore: number,
  scoreFresh: boolean,
  restToday: boolean,
): { face: FaceName; tip: string } {
  if (daysAway >= 14) return { face: 'frozen', tip: 'Been a while... welcome back!' };
  if (daysAway >= 4)  return { face: 'faded', tip: "Getting rusty — let's shake it off!" };
  if (daysAway >= 2)  return { face: 'misty', tip: 'A couple days off — ease back in' };
  if (restToday) {
    return {
      face: 'rested',
      tip: streak > 0
        ? `Rest day — nothing is due. Your ${streak}-day streak is safe.`
        : 'Rest day — nothing is due.',
    };
  }
  if (scoreFresh) {
    if (todayScore >= 90) return { face: 'sharp', tip: 'Top marks today!' };
    if (todayScore >= 75) return { face: 'pleased', tip: 'Strong session!' };
    if (todayScore >= 55) return { face: 'trying', tip: 'Getting there — keep pushing!' };
    return { face: 'rueful', tip: "Tough one — tomorrow's another shot" };
  }
  if (streak >= 100) return { face: 'celebrating', tip: `${streak}-day streak — absolutely legendary!` };
  if (streak >= 30)  return { face: 'fond', tip: `${streak}-day streak — you're on a roll!` };
  if (streak >= 7)   return { face: 'burning', tip: `${streak}-day streak — keep the fire going!` };
  return { face: 'thinking', tip: 'New day — what are we learning?' };
}
