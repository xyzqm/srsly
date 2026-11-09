import type { LanguageCode } from '@/lib/types';
import { UNIT_LESSONS } from '@/lib/lessonUnitIds';

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
   * ⚠ CONCEPT-FIRST, AND THIS RULE WAS DELIBERATELY REVERSED — THE OLD ONE IS KEPT BELOW.
   *
   * It now names the GRAMMAR AND FUNCTION the unit covers: "Essential Verbs: ser vs. estar",
   * "Aspect Particle 了 (le) & Completed Actions", "Te-Form (て形) & Verb Chaining".
   *
   * What this said, for a long time, was the opposite: *"What you can DO at the end of it, not
   * what it covers. 'Say what things are' rather than 'ser and estar' — the second is already
   * the lesson's own title one row below, and a unit heading that repeats it tells the reader
   * nothing they could not see."* That argument is about a reader who is already INSIDE the
   * unit, with the lesson rows visible beneath the heading. It is right about that reader and
   * it was the only reader considered.
   *
   * The units are collapsed by default, so the commoner reader is scanning 10 or 11 closed
   * rows looking for a specific topic — *where is the subjunctive, does this course cover 把* —
   * and for them a capability name is the one thing that cannot answer it. "Ask for things,
   * and wish for them" is a perfectly good sentence that does not contain the word
   * "subjunctive". Worse, the capability names collided: FOUR of the trees opened with the
   * identical "Name things / Say what things are / Say what you do", so three languages' worth
   * of syllabus looked like the same course.
   *
   * The repetition the old rule feared is real and is the accepted cost: a unit heading may
   * now echo a lesson title one row below it. A heading that is redundant once you have opened
   * the unit is cheaper than a heading you cannot search while it is shut.
   *
   * **The `blurb` is what kept this safe.** It still says what the unit buys you in concrete
   * terms — "Washing, dressing, getting up", "the du / de la that English has no word for" —
   * so the capability framing was not deleted, it moved one line down to where there is room
   * for a sentence.
   *
   * ⚠ AND A TITLE MUST NAME ONLY WHAT THE UNIT ACTUALLY TEACHES. Six of the first proposed
   * set did not, and every one would have been a confidently wrong label of exactly the kind
   * `components/read/GrammarNote.tsx` refuses: 到 and 应该 and 正在 appear in NO Chinese lesson;
   * は/が are unit 1 and not unit 2; no Japanese unit teaches the causative; and "Stress
   * Accents" for French contradicts this repo's own finding that **French has no lexical
   * stress** — the whole reason `fr-accents` asks which LETTER an accent describes rather than
   * where a stress falls. Check a title against `UNIT_LESSONS` and the lesson titles before
   * writing it.
   */
  title: string;
  /** One line under the title. Concrete: name the actual sentences it buys. */
  blurb: string;
  /**
   * Lesson ids, in the order they should be met. Grammar runs stay contiguous.
   *
   * Read from `lib/lessonUnitIds.ts` rather than written here, so the ids exist ONCE: that
   * module is the half `lib/achievements.ts` needs, and it is split out by weight because
   * achievements are reached from the app root where these titles must not be. See the note
   * there.
   */
  lessons: string[];
}

/** A unit's prose. The ids live in `UNIT_LESSONS`, keyed by the same id. */
type UnitText = Omit<LessonUnit, 'lessons'>;

const ES: UnitText[] = [
  { id: 'es-u1', title: 'Nouns & Gender (el / la)',
    blurb: 'Your first words, and why every one of them is el or la.' },
  { id: 'es-u2', title: 'Essential Verbs: ser vs. estar',
    blurb: 'The two verbs for "to be", and the one that means "to have" and sometimes "to be".' },
  { id: 'es-u3', title: 'Present Tense & Negation',
    blurb: 'The present tense, and how to say you do not.' },
  { id: 'es-u4', title: 'Adjectives & Expressing Likes (gustar)',
    blurb: 'Adjectives that agree with their noun, and gustar, which works backwards.' },
  { id: 'es-u5', title: 'Directions & Prepositions (por / para)',
    blurb: 'Questions, and the difference between por and para that nobody explains properly.' },
  { id: 'es-u6', title: 'Past Tenses: Preterite vs. Imperfect',
    blurb: 'Two past tenses, what is about to happen, and which past to reach for.' },
  { id: 'es-u7', title: 'Reflexive Verbs & Daily Routines',
    blurb: 'Washing, dressing, getting up — and replacing a noun you have already said.' },
  { id: 'es-u8', title: 'Comparatives & Present Perfect',
    blurb: 'Bigger, smaller, best — and the past that is still going on.' },
  { id: 'es-u9', title: 'Commands & Intro to Subjunctive',
    blurb: 'Telling someone to do something, a first subjunctive, and what will happen.' },
  { id: 'es-u10', title: 'Demonstratives & Functions of se',
    blurb: 'Pointing at things, saying whose they are, and the many jobs of se.' },
  { id: 'es-u11', title: 'Present Continuous & Accent Rules',
    blurb: 'What is happening as you speak, what is there, and where the accent goes.' },
];

const FR: UnitText[] = [
  { id: 'fr-u1', title: 'Nouns & Articles (le / la)',
    blurb: 'Your first words, and why every one of them is le or la.' },
  { id: 'fr-u2', title: 'Essential Verbs: être vs. avoir',
    blurb: 'être and avoir — the two verbs the whole language is built on.' },
  { id: 'fr-u3', title: 'Regular Verbs & Present Tense',
    blurb: 'The -er verbs, which is most of them, and the two words that make a sentence negative.' },
  { id: 'fr-u4', title: 'Partitive Articles & Quantities (du / de la)',
    blurb: 'Adjectives that agree and sometimes move, and the du / de la that English has no word for.' },
  { id: 'fr-u5', title: 'Question Formation & Directions',
    blurb: 'Three ways to ask a question, and what you are going to do next.' },
  { id: 'fr-u6', title: 'Past Tense: Passé Composé',
    blurb: 'The passé composé, the verbs that take être, and the past that sets a scene.' },
  { id: 'fr-u7', title: 'Reflexive Verbs & Object Pronouns',
    blurb: 'Reflexive verbs, pronouns before the verb, and the two little words y and en.' },
  { id: 'fr-u8', title: 'Future Tense & Comparatives',
    blurb: 'Bigger, smaller, best — and the real future tense.' },
  { id: 'fr-u9', title: 'Relative Pronouns & Conjunctions',
    blurb: 'qui and que, telling someone to do something, and saying how long you have been at it.' },
  { id: 'fr-u10', title: 'Subjunctive & Conditional Moods',
    blurb: 'The conditional, a first subjunctive, and which preposition each country takes.' },
  { id: 'fr-u11', title: 'Written Accents & Spelling Rules',
    blurb: 'Pointing at things, saying whose they are, and what each accent is actually for.' },
];

const ZH: UnitText[] = [
  { id: 'zh-u1', title: 'Basic Sentence Structure (S-V-O)',
    blurb: 'Subject, verb, object — and the measure word Chinese puts before every noun.' },
  { id: 'zh-u2', title: 'Possessives & The Particle 的 (de)',
    blurb: '的, the one character that does more work than any other, and 是 and 有.' },
  { id: 'zh-u3', title: 'Aspect Particle 了 (le) & Completed Actions',
    blurb: 'Saying no with 不 and 没, and 了 — the particle everyone gets wrong.' },
  { id: 'zh-u4', title: 'Location & Experience (在 / 过)',
    blurb: '在 for location, and 过 for the things you have done at least once.' },
  { id: 'zh-u5', title: 'Adjective Predicates & Modifiers',
    blurb: 'Four ways to ask a question, and why 很 turns up in front of every adjective.' },
  { id: 'zh-u6', title: 'Disposal Structure 把 (bǎ)',
    blurb: '把 moves the object in front of the verb, and 被 makes it the one it happened to.' },
  { id: 'zh-u7', title: 'Modal Verbs: 会, 能, 可以',
    blurb: 'The modal verbs, and saying how an action turned out.' },
  { id: 'zh-u8', title: 'Time Duration & Frequency Expressions',
    blurb: 'Duration, 就 against 才, and which direction the action is going.' },
  { id: 'zh-u9', title: 'Continuous Action 着 (zhe) & Ongoing States',
    blurb: '着 for a state that continues, wanting things, and putting time in the right place.' },
  { id: 'zh-u10', title: 'Sentence Conjunctions & Tone Particles',
    blurb: 'Because and so, the particles that set the tone, and 都 and 也.' },
];

const JA: UnitText[] = [
  { id: 'ja-u1', title: 'Sentence Order & Final Verbs',
    blurb: 'The verb goes last, and は and が are not the same thing.' },
  { id: 'ja-u2', title: 'Core Particles: を, に, で, へ',
    blurb: 'The particles that say which word is doing what, and です.' },
  { id: 'ja-u3', title: 'Adjective Types (い-adjectives vs. な-adjectives)',
    blurb: 'Two kinds of adjective, and the polite verb forms you will use most.' },
  { id: 'ja-u4', title: 'Te-Form (て形) & Verb Chaining',
    blurb: 'The て form, which half of Japanese grammar hangs off, and ある and いる.' },
  { id: 'ja-u5', title: 'Plain Form & Expressing Desire (たい)',
    blurb: 'The dictionary form, and たい for the things you would like to do.' },
  { id: 'ja-u6', title: 'Counters & Question Words',
    blurb: 'Questions with か, and the counter words Japanese needs for every kind of thing.' },
  { id: 'ja-u7', title: 'Potential Form & Conditional Particles (ば / たら)',
    blurb: 'The potential form, and the four ways Japanese says "if".' },
  { id: 'ja-u8', title: 'Giving & Receiving Verbs (あげる / もらう / くれる)',
    blurb: 'Who did what for whom, verb pairs that come in twos, and describing with a clause.' },
  { id: 'ja-u9', title: 'Causes & Obligation (から / なければ)',
    blurb: 'から and ので, comparing two things, and saying you have to.' },
  { id: 'ja-u10', title: 'Polite Speech (Keigo) & Time Structures',
    blurb: 'Counting hours and days, keigo, and stacking words in front of a noun.' },
];

const TEXT: Partial<Record<LanguageCode, UnitText[]>> = { es: ES, fr: FR, zh: ZH, ja: JA };

const joined = new Map<LanguageCode, LessonUnit[]>();

/**
 * The units, prose and ids joined.
 *
 * A unit whose id has no entry in `UNIT_LESSONS` is DROPPED rather than rendered with an
 * empty lesson list — an empty unit is a row that opens onto nothing, and
 * `tests/lessonUnits.test.ts` asserts the two sides name exactly the same units, so this is
 * unreachable rather than a quiet fallback.
 */
export function unitsFor(lang: LanguageCode): LessonUnit[] {
  const cached = joined.get(lang);
  if (cached) return cached;
  const ids = UNIT_LESSONS[lang] ?? {};
  const out = (TEXT[lang] ?? [])
    .filter(u => ids[u.id]?.length)
    .map(u => ({ ...u, lessons: ids[u.id] }));
  joined.set(lang, out);
  return out;
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
