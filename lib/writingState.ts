import { todayStr } from './deck';
import { isLearningCard, DEFAULT_SRS_SETTINGS, type FsrsGrade, type SrsSettings } from './fsrs';
import { isDrillDue, scheduleDrill, type DrillCard, type DrillCards } from './drillState';

/**
 * Handwriting practice, scheduled per CHARACTER.
 *
 * ── THE KEY IS A CHARACTER, AND THAT IS THE WHOLE DESIGN ──
 * A deck card is a WORD. Writing is a character skill: 朋友 is one card and two things to
 * learn to draw, and 朋 reappears in every other word the learner owns that contains it.
 * Keyed by word, one character's schedule would exist in as many copies as it has words, and
 * they would disagree from the first review — a second record of one fact, which this codebase
 * refuses everywhere else.
 *
 * It also makes writing a SMALLER set than the deck rather than a doubling of it: HSK's 4,991
 * words are built from 2,663 distinct characters.
 *
 * ── IT IS FIREWALLED FROM READING, DELIBERATELY AND COMPLETELY ──
 * Nothing here feeds `isDueToday`, the reading streak, the daily new-card budget or the
 * activity heatmap. `dueWritingChars` is a separate function rather than a flag on the
 * existing one precisely so that no reading surface can accidentally start counting it.
 * Writing is optional practice — a gym, not a daily requirement — and being a month behind on
 * it must not read to the learner as a broken streak. That is the same firewall the lesson
 * tree already has: "the curriculum reads NO scheduling state".
 *
 * ── CHINESE ONLY, AND THE REASON IS DATA HONESTY ──
 * The stroke data (`public/strokes/`) is Chinese. Measured against it, 88.7% of JLPT kanji are
 * present — but the 223 missing are exactly the shinjitai (厳 倹 権 鉱 渉 沢 団 読 売 楽 児 発),
 * and among the ones that ARE present are characters whose Japanese stroke order or shape
 * differs (直, 令, 骨). Using it for Japanese would teach confidently wrong stroke order for a
 * subset nobody could identify, which is worse than teaching none. Japanese needs KanjiVG.
 */

/** One character's schedule. Nothing but scheduling — a character has no gloss to carry. */
export type WritingCard = DrillCard;

/** Every practised character in one language. Absent key = never practised. */
export type WritingCards = DrillCards;

/**
 * The storage half now lives in `lib/drillState.ts`, keyed `w:好`.
 *
 * Handwriting works in BARE CHARACTERS and knows nothing about that prefix — `drillView`
 * strips it on the way in and `drillWrite` restores it on the way out, so the shared column is
 * an encoding detail that stops at the storage boundary. Merging moved with it, because the
 * rule (a card is owned whole, ties resolved commutatively) was never specific to characters.
 */

const HAN = /[一-鿿]/;

/**
 * Which characters this deck makes writable.
 *
 * Derived from the deck on read rather than stored, for the reason the milestones give: a
 * second list would drift the moment a word was deleted. Non-Han characters are dropped —
 * a deck word can carry Latin letters or punctuation, and there is no stroke data for those.
 */
export function writableChars(words: readonly { h: string }[]): string[] {
  const seen = new Set<string>();
  for (const w of words) for (const ch of w.h) if (HAN.test(ch)) seen.add(ch);
  return [...seen];
}

/**
 * Due for writing today.
 *
 * A character with no card has never been practised and IS due — the same "absent means due
 * immediately" rule `isDueToday` uses for `dueAt`. Unlike the reading queue there is no
 * pause, snooze or leech state to consult: those exist to protect a daily obligation, and
 * writing is not one.
 */
export function isWritingDue(card: WritingCard | undefined, today: string = todayStr()): boolean {
  return isDrillDue(card, today);
}

/** The writable characters that are due, in the deck's own order. */
export function dueWritingChars(
  chars: readonly string[],
  cards: WritingCards,
  today: string = todayStr(),
): string[] {
  return chars.filter(ch => isWritingDue(cards[ch], today));
}

/**
 * Turn a quiz result into a grade.
 *
 * `HanziWriter`'s quiz reports the number of wrong strokes and whether the outline was ever
 * shown, which is more than a self-graded flashcard knows — so the learner is not asked.
 *
 * THERE IS NO "EASY", ON PURPOSE. Easy means "I knew this instantly and want a much longer
 * interval", and a stroke count cannot observe it: drawing every stroke correctly is exactly
 * what Good already describes. Offering it would mean inventing a distinction the input
 * cannot support, which is the same refusal as not fabricating a gloss for a character card.
 *
 * A hint is a failure however clean the strokes after it were — the learner was shown the
 * answer, and the whole question was whether they could produce it unaided.
 */
export function gradeFromStrokes(mistakes: number, usedHint: boolean): FsrsGrade {
  if (usedHint || mistakes >= 3) return 1;   // Again
  if (mistakes > 0) return 2;                // Hard
  return 3;                                  // Good
}

/** Schedule one character after a quiz. Returns the card to store. */
export function scheduleWriting(
  card: WritingCard | undefined,
  grade: FsrsGrade,
  settings: SrsSettings = DEFAULT_SRS_SETTINGS,
): WritingCard {
  return scheduleDrill(card, grade, settings);
}

/** Whether this character is still in its learning steps — used only for the UI's own label. */
export function isWritingLearning(card: WritingCard | undefined): boolean {
  return isLearningCard(card ?? {});
}
