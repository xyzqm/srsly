import type { LanguageCode } from '@/lib/types';

/**
 * THE COURSE, CUT INTO UNITS — one path, grammar and words interleaved.
 *
 * ── WHY THIS REPLACED TWO LISTS ──────────────────────────────────────────────
 *
 * The Learn tab used to render two sections: a numbered grammar track and, 29 rows further
 * down, a pile of word sets "in no particular order". The reasoning was sound and is written
 * out in `lib/lessons.ts` — grammar builds on itself and vocabulary does not, so numbering the
 * word sets would invent a prerequisite nobody has. All of that is still true. What it missed
 * is what the screen actually became: **50 identical rows, 3,853 pixels tall**, opening on
 * "Every noun has a gender" for somebody who had just told the app they were new to Spanish,
 * under a paragraph explaining that the order was only a suggestion.
 *
 * Two separate failures came out of that, and only the first is about motivation:
 *
 * - **A list with no shape gives nothing back.** There is no sense of place in 50 rows, no
 *   point at which anything is finished, and no answer to "how far in am I". A unit is small
 *   enough to complete, which is the only reason a progress ring means anything.
 * - **You cannot practise gender with no nouns.** The split put every word a beginner owns
 *   behind the entire grammar track. Interleaving is not decoration here: `es-v-basics` has to
 *   come before `es-gender` or the first lesson is a rule about a vocabulary the learner does
 *   not have.
 *
 * ── WHAT IS PRESERVED, EXACTLY ───────────────────────────────────────────────
 *
 * **Grammar keeps its relative order.** That was the real content of the old rule — the passé
 * composé cannot be explained to somebody who has not met a participle — and it survives: a
 * unit takes a CONTIGUOUS RUN of the grammar track, never a reshuffle. `tests/lessonUnits.test.ts`
 * asserts that against the authored arrays, so a unit cannot quietly reorder the course.
 *
 * **Word sets still have no prerequisite.** They are placed beside the grammar they feed
 * rather than ranked against each other, which is a different claim from "colours before
 * food": `es-v-colours` sits in the unit about adjectives because that is what the adjective
 * lesson needs to talk about, not because colours are harder than food.
 *
 * **ORDERED, NEVER LOCKED.** Nothing here is `disabled`, no unit gates another, and every
 * lesson opens on day one. A unit is a shape, not a gate. If a unit ever acquires a lock, that
 * decision has been reversed and should be reversed knowingly — see `lib/lessons.ts`.
 *
 * **Nothing is stored.** A unit's progress is counted over the same `srsly-lessons-done` set
 * the rows already read. There is no second record of what has been finished, which is this
 * repo's first design rule.
 *
 * ── AUTHORED, NOT DERIVED ────────────────────────────────────────────────────
 *
 * The obvious build reads the id prefix — everything `*-v-*` is vocabulary, chunk the rest in
 * fives. That gives a grouping nobody chose, and `lib/achievements.ts` already states the
 * reason not to: `FAMILIES` groups its milestones explicitly because the ids are a storage key
 * and parsing them makes a rename a silent behaviour change. A unit boundary is a teaching
 * judgement — it is where one thing you can DO ends and the next begins — and there is no
 * signal in the data that knows where that is.
 */
export interface LessonUnit {
  /** Stable, for React keys and tests. Nothing is stored against it. */
  id: string;
  /**
   * What you can DO at the end of it, not what it covers.
   *
   * "Say what things are" rather than "ser and estar" — the second is already the lesson's own
   * title one row below, and a unit heading that repeats it tells the reader nothing they
   * could not see. The point of a unit is that it names a capability the individual lessons
   * only add up to.
   */
  title: string;
  /** One line under the title. Concrete: name the actual sentences it buys. */
  blurb: string;
  /** Lesson ids, in the order they should be met. Grammar runs stay contiguous. */
  lessons: string[];
}

const ES: LessonUnit[] = [
  { id: 'es-u1', title: 'Name things',
    blurb: 'Your first words, and why every one of them is el or la.',
    lessons: ['es-v-basics', 'es-gender', 'es-plural', 'es-articles', 'es-v-numbers'] },
  { id: 'es-u2', title: 'Say what things are',
    blurb: 'The two verbs for "to be", and the one that means "to have" and sometimes "to be".',
    lessons: ['es-v-family', 'es-ser-estar', 'es-tener', 'es-v-adjectives'] },
  { id: 'es-u3', title: 'Say what you do',
    blurb: 'The present tense, and how to say you do not.',
    lessons: ['es-v-verbs', 'es-present', 'es-negation', 'es-v-routine'] },
  { id: 'es-u4', title: 'Describe it, and say you like it',
    blurb: 'Adjectives that agree with their noun, and gustar, which works backwards.',
    lessons: ['es-v-colours', 'es-gustar', 'es-adjectives', 'es-adj-position', 'es-v-food'] },
  { id: 'es-u5', title: 'Ask, and get around',
    blurb: 'Questions, and the difference between por and para that nobody explains properly.',
    lessons: ['es-v-places', 'es-questions', 'es-por-para', 'es-v-transport'] },
  { id: 'es-u6', title: 'Talk about yesterday',
    blurb: 'Two past tenses, what is about to happen, and which past to reach for.',
    lessons: ['es-v-weekdays', 'es-futuro-proximo', 'es-preterito', 'es-imperfecto', 'es-v-months'] },
  { id: 'es-u7', title: 'Yourself, and other people',
    blurb: 'Washing, dressing, getting up — and replacing a noun you have already said.',
    lessons: ['es-v-body', 'es-reflexive', 'es-object-pronouns', 'es-saber-conocer', 'es-v-clothing'] },
  { id: 'es-u8', title: 'Compare, and say what you have done',
    blurb: 'Bigger, smaller, best — and the past that is still going on.',
    lessons: ['es-v-weather', 'es-perfecto', 'es-comparatives', 'es-v-seasons'] },
  { id: 'es-u9', title: 'Ask for things, and wish for them',
    blurb: 'Telling someone to do something, a first subjunctive, and what will happen.',
    lessons: ['es-v-house', 'es-imperative', 'es-subjunctive', 'es-future-conditional', 'es-v-school'] },
  { id: 'es-u10', title: 'This one, that one, mine',
    blurb: 'Pointing at things, saying whose they are, and the many jobs of se.',
    lessons: ['es-v-animals', 'es-demonstratives', 'es-possessives', 'es-se', 'es-v-tableware'] },
  { id: 'es-u11', title: 'Right now, and writing it correctly',
    blurb: 'What is happening as you speak, what is there, and where the accent goes.',
    lessons: ['es-progressive', 'es-hay', 'es-accents', 'es-v-everyday'] },
];

const FR: LessonUnit[] = [
  { id: 'fr-u1', title: 'Name things',
    blurb: 'Your first words, and why every one of them is le or la.',
    lessons: ['fr-v-basics', 'fr-gender', 'fr-plural', 'fr-articles', 'fr-v-numbers'] },
  { id: 'fr-u2', title: 'Say what things are',
    blurb: 'être and avoir — the two verbs the whole language is built on.',
    lessons: ['fr-v-family', 'fr-etre', 'fr-avoir', 'fr-v-adjectives'] },
  { id: 'fr-u3', title: 'Say what you do',
    blurb: 'The -er verbs, which is most of them, and the two words that make a sentence negative.',
    lessons: ['fr-v-verbs', 'fr-er-verbs', 'fr-negation', 'fr-v-routine'] },
  { id: 'fr-u4', title: 'Describe it, and order some of it',
    blurb: 'Adjectives that agree and sometimes move, and the du / de la that English has no word for.',
    lessons: ['fr-v-food', 'fr-partitif', 'fr-adjectives', 'fr-adj-position', 'fr-v-colours'] },
  { id: 'fr-u5', title: 'Ask, and get around',
    blurb: 'Three ways to ask a question, and what you are going to do next.',
    lessons: ['fr-v-places', 'fr-questions', 'fr-futur-proche', 'fr-v-transport'] },
  { id: 'fr-u6', title: 'Talk about yesterday',
    blurb: 'The passé composé, the verbs that take être, and the past that sets a scene.',
    lessons: ['fr-v-weekdays', 'fr-passe-compose', 'fr-passe-etre', 'fr-imparfait', 'fr-v-months'] },
  { id: 'fr-u7', title: 'Yourself, and other people',
    blurb: 'Reflexive verbs, pronouns before the verb, and the two little words y and en.',
    lessons: ['fr-v-body', 'fr-reflexive', 'fr-object-pronouns', 'fr-y-en', 'fr-v-clothing'] },
  { id: 'fr-u8', title: 'Compare, and say what will happen',
    blurb: 'Bigger, smaller, best — and the real future tense.',
    lessons: ['fr-v-weather', 'fr-comparatives', 'fr-futur-simple', 'fr-v-seasons'] },
  { id: 'fr-u9', title: 'Join sentences, and ask for things',
    blurb: 'qui and que, telling someone to do something, and saying how long you have been at it.',
    lessons: ['fr-v-house', 'fr-relative', 'fr-imperative', 'fr-depuis', 'fr-v-school'] },
  { id: 'fr-u10', title: 'Wishes, doubts and directions',
    blurb: 'The conditional, a first subjunctive, and which preposition each country takes.',
    lessons: ['fr-v-animals', 'fr-conditionnel', 'fr-subjonctif', 'fr-prepositions-places', 'fr-v-tableware'] },
  { id: 'fr-u11', title: 'This one, mine, and writing it correctly',
    blurb: 'Pointing at things, saying whose they are, and what each accent is actually for.',
    lessons: ['fr-demonstratives', 'fr-possessives', 'fr-accents', 'fr-v-everyday'] },
];

const ZH: LessonUnit[] = [
  { id: 'zh-u1', title: 'Build a sentence',
    blurb: 'Subject, verb, object — and the measure word Chinese puts before every noun.',
    lessons: ['zh-v-basics', 'zh-word-order', 'zh-measure-words', 'zh-v-numbers'] },
  { id: 'zh-u2', title: 'Say who, and whose',
    blurb: '的, the one character that does more work than any other, and 是 and 有.',
    lessons: ['zh-v-family', 'zh-de', 'zh-shi-you', 'zh-v-body'] },
  { id: 'zh-u3', title: 'Say what happened',
    blurb: 'Saying no with 不 and 没, and 了 — the particle everyone gets wrong.',
    lessons: ['zh-v-verbs', 'zh-negation', 'zh-le', 'zh-v-routine'] },
  { id: 'zh-u4', title: 'Where you are, where you have been',
    blurb: '在 for location, and 过 for the things you have done at least once.',
    lessons: ['zh-v-places', 'zh-guo', 'zh-zai', 'zh-v-transport'] },
  { id: 'zh-u5', title: 'Ask, and describe',
    blurb: 'Four ways to ask a question, and why 很 turns up in front of every adjective.',
    lessons: ['zh-v-adjectives', 'zh-questions', 'zh-adjectives', 'zh-v-colours'] },
  { id: 'zh-u6', title: 'Do something to something',
    blurb: '把 moves the object in front of the verb, and 被 makes it the one it happened to.',
    lessons: ['zh-v-house', 'zh-ba', 'zh-bei', 'zh-v-clothing'] },
  { id: 'zh-u7', title: 'Can, should, want',
    blurb: 'The modal verbs, and saying how an action turned out.',
    lessons: ['zh-v-food', 'zh-modals', 'zh-resultative', 'zh-v-weather'] },
  { id: 'zh-u8', title: 'How long, and how soon',
    blurb: 'Duration, 就 against 才, and which direction the action is going.',
    lessons: ['zh-v-school', 'zh-duration', 'zh-jiu-cai', 'zh-directional', 'zh-v-animals'] },
  { id: 'zh-u9', title: 'What is going on right now',
    blurb: '着 for a state that continues, wanting things, and putting time in the right place.',
    lessons: ['zh-v-weekdays', 'zh-zhe', 'zh-yao-xiang', 'zh-time-words', 'zh-v-months'] },
  { id: 'zh-u10', title: 'Join it up, and soften it',
    blurb: 'Because and so, the particles that set the tone, and 都 and 也.',
    lessons: ['zh-yinwei', 'zh-ne-ba', 'zh-dou-ye', 'zh-v-seasons', 'zh-v-tableware', 'zh-v-everyday'] },
];

const JA: LessonUnit[] = [
  { id: 'ja-u1', title: 'Build a sentence',
    blurb: 'The verb goes last, and は and が are not the same thing.',
    lessons: ['ja-v-basics', 'ja-word-order', 'ja-wa-ga', 'ja-v-numbers'] },
  { id: 'ja-u2', title: 'Mark every part of it',
    blurb: 'The particles that say which word is doing what, and です.',
    lessons: ['ja-v-family', 'ja-particles', 'ja-desu', 'ja-v-body'] },
  { id: 'ja-u3', title: 'Describe it, and do it',
    blurb: 'Two kinds of adjective, and the polite verb forms you will use most.',
    lessons: ['ja-v-adjectives', 'ja-adjectives', 'ja-verbs', 'ja-v-colours'] },
  { id: 'ja-u4', title: 'Join actions together',
    blurb: 'The て form, which half of Japanese grammar hangs off, and ある and いる.',
    lessons: ['ja-v-verbs', 'ja-te-form', 'ja-aru-iru', 'ja-v-routine'] },
  { id: 'ja-u5', title: 'Speak plainly, and say what you want',
    blurb: 'The dictionary form, and たい for the things you would like to do.',
    lessons: ['ja-v-food', 'ja-plain-form', 'ja-tai', 'ja-v-places'] },
  { id: 'ja-u6', title: 'Ask, and count',
    blurb: 'Questions with か, and the counter words Japanese needs for every kind of thing.',
    lessons: ['ja-v-transport', 'ja-questions', 'ja-counters', 'ja-v-house'] },
  { id: 'ja-u7', title: 'Can, and what if',
    blurb: 'The potential form, and the four ways Japanese says "if".',
    lessons: ['ja-v-clothing', 'ja-potential', 'ja-conditionals', 'ja-v-weather'] },
  { id: 'ja-u8', title: 'Giving, receiving, and what moved',
    blurb: 'Who did what for whom, verb pairs that come in twos, and describing with a clause.',
    lessons: ['ja-v-school', 'ja-giving-receiving', 'ja-transitive-pairs', 'ja-relative-clauses', 'ja-v-animals'] },
  { id: 'ja-u9', title: 'Because, more than, and must',
    blurb: 'から and ので, comparing two things, and saying you have to.',
    lessons: ['ja-v-weekdays', 'ja-kara-node', 'ja-comparatives', 'ja-nakereba', 'ja-v-months'] },
  { id: 'ja-u10', title: 'Time, politeness, and joining it up',
    blurb: 'Counting hours and days, keigo, and stacking words in front of a noun.',
    lessons: ['ja-counters-time', 'ja-keigo', 'ja-noun-modifiers', 'ja-v-seasons', 'ja-v-tableware', 'ja-v-everyday'] },
];

const UNITS: Partial<Record<LanguageCode, LessonUnit[]>> = { es: ES, fr: FR, zh: ZH, ja: JA };

export function unitsFor(lang: LanguageCode): LessonUnit[] {
  return UNITS[lang] ?? [];
}

/**
 * Where the learner is in the course: the first lesson they have not finished.
 *
 * `nextGrammarLesson` in `lib/lessons.ts` answered the same question for the old two-list
 * tree and is kept, because it still describes the grammar track and the track still exists
 * inside the units. This one walks the COURSE — units in order, lessons in order — so the
 * answer can be a word set, which is the whole point of interleaving them.
 *
 * Returns the unit as well as the lesson. A "Continue" control that names the lesson without
 * naming where it sits tells the reader what to press and nothing about how far in they are,
 * and the unit is the only thing on this screen that makes "4 of 11" mean anything.
 */
export function nextInCourse(units: LessonUnit[], done: Set<string>):
  { unit: LessonUnit; lessonId: string; index: number } | null {
  for (const unit of units) {
    for (const lessonId of unit.lessons) {
      if (!done.has(lessonId)) return { unit, lessonId, index: units.indexOf(unit) };
    }
  }
  return null;   // the whole course is finished — a real state, and it gets its own sentence
}

/** How much of a unit is behind you. Derived, never stored — see the note at the top. */
export function unitProgress(unit: LessonUnit, done: Set<string>): { done: number; total: number } {
  return { done: unit.lessons.filter(id => done.has(id)).length, total: unit.lessons.length };
}
