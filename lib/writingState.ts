import type { LanguageCode } from './types';
import { todayStr } from './deck';
import { canonicalJson } from './canonicalJson';
import {
  fsrsSchedule, isLearningCard, DEFAULT_SRS_SETTINGS,
  type FsrsGrade, type SrsSettings, type Schedulable,
} from './fsrs';

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
export type WritingCard = Schedulable;

/** Every practised character in one language. Absent key = never practised. */
export type WritingCards = Record<string, WritingCard>;

/** The whole column, per language then per character — the same shape as `decks`. */
export type WritingState = Partial<Record<LanguageCode, WritingCards>>;

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
  if (!card) return true;
  return !card.dueAt || card.dueAt <= today;
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
  const base: WritingCard = card ?? {};
  return { ...base, ...fsrsSchedule(base, grade, settings, { fuzz: true }) };
}

/** Whether this character is still in its learning steps — used only for the UI's own label. */
export function isWritingLearning(card: WritingCard | undefined): boolean {
  return isLearningCard(card ?? {});
}

/**
 * Merge two devices' writing state.
 *
 * ── A CARD IS OWNED WHOLE, NOT MERGED PER FIELD ──
 * `stability`, `difficulty`, `lapses` and `dueAt` describe ONE review history. Taking a
 * per-field maximum would compose a state neither device was ever in — a stability from
 * Tuesday's laptop beside a lapse count from Wednesday's phone — which is exactly the
 * argument `lib/srsStateMerge.ts` makes about the streak. The later `lastReview` owns the
 * whole card.
 *
 * ── AND IT HAS TO BE COMMUTATIVE, NOT JUST DETERMINISTIC ──
 * A device writes its merged copy back and the cloud then holds the merge, so `merge(a, b)`
 * and `merge(b, a)` must agree or two devices ping-pong for ever. "Take mine on a tie" is
 * deterministic and NOT commutative, so ties fall through a chain of value-only comparisons
 * and finally to canonical JSON order — which depends on the cards' contents and never on
 * which argument they arrived in.
 */
export function mergeWritingCards(mine: WritingCards, theirs: WritingCards): WritingCards {
  const out: WritingCards = {};
  for (const ch of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const a = mine[ch], b = theirs[ch];
    if (!a) { out[ch] = b; continue; }
    if (!b) { out[ch] = a; continue; }
    out[ch] = ownerOf(a, b);
  }
  return out;
}

/** The card with the better claim to be the real history. Value-only, so it is commutative. */
function ownerOf(a: WritingCard, b: WritingCard): WritingCard {
  const byDate = (a.lastReview ?? '').localeCompare(b.lastReview ?? '');
  if (byDate !== 0) return byDate > 0 ? a : b;
  // Same day on both devices: prefer the one that has done more, since a review is only ever
  // added. Each of these is a count that grows, so "more" is "later" without a clock.
  if ((a.reviews ?? 0) !== (b.reviews ?? 0)) return (a.reviews ?? 0) > (b.reviews ?? 0) ? a : b;
  if ((a.lapses ?? 0) !== (b.lapses ?? 0)) return (a.lapses ?? 0) > (b.lapses ?? 0) ? a : b;
  if ((a.stability ?? 0) !== (b.stability ?? 0)) return (a.stability ?? 0) > (b.stability ?? 0) ? a : b;
  // Indistinguishable by history. Order on content so both devices pick the same one.
  return canonicalJson(a) <= canonicalJson(b) ? a : b;
}

/** Merge whole columns, language by language. */
export function mergeWritingState(mine: WritingState, theirs: WritingState): WritingState {
  const out: WritingState = {};
  for (const lang of new Set([...Object.keys(mine), ...Object.keys(theirs)]) as Set<LanguageCode>) {
    out[lang] = mergeWritingCards(mine[lang] ?? {}, theirs[lang] ?? {});
  }
  return out;
}

/* ─────────────────────── device-local persistence ─────────────────────── */

/**
 * One key per language, mirroring `srsly-vocab-deck-{lang}`.
 *
 * Kept here rather than in `lib/storage/local.ts` for the same reason `loadDone`/`saveDone`
 * live in `lib/lessons.ts`: the shape belongs to the feature, and the storage layer should be
 * able to delegate without knowing what a WritingCard is.
 */
const KEY = (lang: LanguageCode) => `srsly-writing-${lang}`;

export function loadWriting(lang: LanguageCode): WritingCards {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY(lang)) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as WritingCards : {};
  } catch {
    return {};
  }
}

export function saveWriting(lang: LanguageCode, cards: WritingCards): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY(lang), JSON.stringify(cards)); } catch { /* quota */ }
}
