import type { LanguageCode } from './types';
import { difficultyTier } from './languageConfig';

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
 * The topics a BEGINNER passage may be about — and the reason this list exists is measured.
 *
 * ── YOU CANNOT WRITE "HOW TO MAKE A BEADED BRACELET" AT A1 ──
 * `PASSAGE_TOPICS` was one flat list shared by every level; `level` only shifted the index
 * into it and never filtered the pool. Across 52 generated Spanish passages, A1 put **20.1%
 * of its tokens above A1** against 2.6% at C1 — and the worst offenders were not badly
 * written, they were written about the wrong things. The noun the passage is ABOUT was the
 * problem: `pulsera` (C2) in "how to make a beaded bracelet", `ave` (B1) in "recommendations
 * for birdwatching", `mineral` (B2) in a story about a discovery. Handed that topic the model
 * either uses the word or writes about something else, and it correctly uses the word.
 *
 * ── THE ARGUMENT WAS ALREADY IN THIS FILE, ON THE OTHER AXIS ──
 * `PASSAGE_FORMS` below says it outright: "A form the model cannot execute at a beginner level
 * produces worse output." That reasoning was applied to FORM and never to TOPIC.
 *
 * ── TIERED OFF THE CONFIG, NOT OFF `level <= 2` ──
 * `difficultyTier` already answers this question for every language, and the numbering runs in
 * opposite directions (JLPT N5 is the beginner level, HSK 1 and A1 are). A comparison on the
 * raw number would be right for three languages and backwards for Japanese.
 *
 * ── AUTHORED, AND THEN CHECKED ──
 * Which topics belong here is a judgement; what makes it more than taste is that the A1 sweep
 * is re-run against it. Kept at sixteen rather than a handful so the pool still varies — a
 * beginner who gets food, family and weather on rotation has traded one complaint for another.
 * Every entry must also appear in PASSAGE_TOPICS, which `tests/passageTheme.test.ts` asserts,
 * so a typo here cannot invent a topic that exists nowhere else.
 *
 * ── TWO WERE CUT ON A SECOND PASS, AND THE EVIDENCE DIFFERED FOR EACH ──
 * `cooking at home` produced the worst A1 passage of the ten at 75% — `ingrediente` (C1),
 * `casera` (C1), `delicioso` (B2) — and the mechanism is the same one that cut the bracelet:
 * a recipe is about its ingredients, and ingredient words are technical in any language.
 * `holidays and festivals` was cut on the MECHANISM ALONE and against its own number: its one
 * passage scored 87%, at the A1 mean, but the vocabulary of celebrating — `decorar`, `disfrutar`,
 * `celebrar` — is A2 and up before a beginner has anywhere to put it. Worth stating plainly
 * because ten passages over sixteen topics is roughly ONE observation each, which cannot rank
 * topics: `coffee and cafés` scored 82%, worse than festivals, and stays. Re-measure before
 * cutting further, and cut on why a topic forces a word rather than on a single score.
 */
export const BEGINNER_TOPICS = [
  'travel and transportation', 'food and restaurants',
  'family and relationships', 'health and exercise', 'shopping and money',
  'education and learning', 'city life and neighborhoods', 'weather and seasons',
  'friendship and social life', 'hobbies and free time', 'books and reading',
  'animals and pets', 'films and television',
  'clothes and style', 'coffee and cafés',
  'neighbours and community',
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
  // A beginner draws from the narrower pool — see BEGINNER_TOPICS for the measurement.
  const pool: readonly string[] =
    difficultyTier(language, level) === 'beginner' ? BEGINNER_TOPICS : PASSAGE_TOPICS;
  const i = (hash(`${date}|${language}|${level}`) + offset) % pool.length;
  return pool[i];
}

/**
 * Seeded separately from the topic — the extra `form` literal in the hash input is what stops
 * the two axes moving in lockstep. Seeded on the same day/language/level so the pairing is
 * stable within a passage, but a different offset re-rolls both.
 */
export function passageForm(date: string, language: LanguageCode, level: number, offset = 0): string {
  /**
   * THE HIGH BITS, AND THAT IS NOT A FLOURISH.
   *
   * FNV-1a is `h = (h ^ c) * prime` over 32 bits, and multiply-and-xor mod 2^32 has a property
   * worth knowing: the low k bits of the result depend ONLY on the low k bits of the input. So
   * the low bits of `hash(key|form)` are a fixed function of the low bits of `hash(key)` — the
   * two draws are not independent down there, however different the strings look. Measured: the
   * offset was a constant 4, so with a topic pool of 16 the topic determined `hash(key) % 8`
   * outright and every topic got exactly ONE form, for ever. Dropping the beginner pool from 18
   * to 16 is what made it total, and `tests/passageTheme.test.ts` caught it on that commit.
   *
   * It was never actually independent, only diluted: over a year, taking the low bits gave a
   * topic a mean of 4.0 forms out of 8 at eighteen topics and 3.5 at forty-two. The high half
   * depends on every bit of the input, so the same measurement gives 7.9, 7.4 and 5.4 — and the
   * forms stay evenly spread (34–53 across the eight over 365 days).
   *
   * Reordering the seed string does NOT fix it; that was measured too, and 16 topics still gave
   * every topic one form. The fix has to be which BITS are read, not which string is hashed.
   */
  const i = ((hash(`${date}|${language}|${level}|form`) >>> 16) + offset) % PASSAGE_FORMS.length;
  return PASSAGE_FORMS[i];
}
