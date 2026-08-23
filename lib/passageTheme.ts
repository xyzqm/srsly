import type { LanguageCode } from './types';

/**
 * What a generated passage is ABOUT, and what SHAPE it takes.
 *
 * Two axes, seeded independently, because one was not enough. A learner reported that "the
 * theme was always the same", and the old selection had three separate ways of being right
 * about that:
 *
 * 1. **It was seeded on the date alone.** Switching study language on the same day restarted
 *    `themeOffset` at 0 (it counts passages within ONE language — see `useDailyContent`), so
 *    the first Spanish passage and the first Chinese passage of a day got the identical topic.
 * 2. **The hash was a sum of the date's parts**, so dates a month apart collided outright:
 *    2026-08-22 and 2026-09-21 both summed to 2056. Consecutive days stepped +1 through the
 *    list, which is a visible walk rather than a shuffle.
 * 3. **Topic alone does not vary a passage enough.** Fifteen topics on a +1 walk repeats in a
 *    fortnight, and every passage on a topic still came out as the same kind of text. FORM is
 *    the second axis: the same vocabulary as a diary entry, a dialogue and a how-to are three
 *    different readings.
 *
 * Both are PURE FUNCTIONS of their inputs — same day, same language, same level, same result,
 * with no state to cache or invalidate. That is the `lib/proverb.ts` pattern, and it is what
 * makes this testable without a network call.
 */

/** What the passage is about. */
export const PASSAGE_TOPICS = [
  'travel and transportation', 'food and restaurants', 'work and career',
  'family and relationships', 'health and exercise', 'technology and the internet',
  'nature and the environment', 'shopping and money', 'education and learning',
  'art and entertainment', 'city life and neighborhoods', 'weather and seasons',
  'friendship and social life', 'hobbies and free time', 'history and culture',
  'music and instruments', 'sport and competition', 'books and reading',
  'cooking at home', 'gardening and plants', 'animals and pets',
  'films and television', 'holidays and festivals', 'the sea and the coast',
  'mountains and hiking', 'markets and street food', 'trains and journeys',
  'letters and keeping in touch', 'moving house', 'learning to drive',
  'the night sky and space', 'rivers and bridges', 'photography',
  'clothes and style', 'coffee and cafés', 'neighbours and community',
  'childhood memories', 'science and discovery', 'craft and making things',
  'rain and storms', 'libraries and museums', 'birds and birdwatching',
] as const;

/**
 * What KIND of text it is. Deliberately all things a short passage can actually be at A1 —
 * no essays, no reports. A form the model cannot execute at a beginner level produces worse
 * output than no instruction at all.
 */
export const PASSAGE_FORMS = [
  'a short anecdote told in the past tense',
  'a description of a place, in the present tense',
  'a diary entry',
  'a letter to a friend',
  'a simple how-to, in steps',
  'a scene between two people, with what they say',
  'a comparison of two things',
  'a short list of recommendations, with a reason for each',
] as const;

/**
 * A string hash — FNV-1a, 32-bit.
 *
 * Any real hash would do; what matters is that it is not the old `sum of the date's parts`,
 * which collided across months and walked the list by one each day. This avalanches, so
 * consecutive days and neighbouring languages land in unrelated places.
 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * @param date        `YYYY-MM-DD`
 * @param language    the study language — part of the seed so switching language on the same
 *                    day changes the topic instead of repeating it
 * @param level       the level index, so two learners on the same day differ too
 * @param offset      which passage this is within the day (`themeOffset`), for within-day variety
 */
export function passageTopic(date: string, language: LanguageCode, level: number, offset = 0): string {
  const i = (hash(`${date}|${language}|${level}`) + offset) % PASSAGE_TOPICS.length;
  return PASSAGE_TOPICS[i];
}

/**
 * Seeded separately from the topic — the extra `form` literal in the hash input is what stops
 * the two axes moving in lockstep. Seeded on the same day/language/level so the pairing is
 * stable within a passage, but a different offset re-rolls both.
 */
export function passageForm(date: string, language: LanguageCode, level: number, offset = 0): string {
  const i = (hash(`${date}|${language}|${level}|form`) + offset) % PASSAGE_FORMS.length;
  return PASSAGE_FORMS[i];
}
