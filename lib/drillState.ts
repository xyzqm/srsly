import type { LanguageCode } from './types';
import {
  fsrsSchedule, DEFAULT_SRS_SETTINGS,
  type Schedulable, type FsrsGrade, type SrsSettings,
} from './fsrs';
import { todayStr } from './deck';
import { canonicalJson } from './canonicalJson';

/**
 * Scheduling for the DRILLS — the practice that is not the deck.
 *
 * A deck card is a WORD. A drill card is something else that has its own review history and
 * its own key: a CHARACTER you learn to write, and (Phase 6) a conjugation fact you learn to
 * produce. Both are per-item FSRS state living outside `decks`, both merge by exactly the same
 * rule, and both need the same offline queue and the same column. So they share one.
 *
 * ── THIS REPLACED `writing_state`, AND THE RENAME IS THE POINT ──
 * The column was created for handwriting alone. A second drill would have meant a second
 * column, a second migration, a second merge, a second entry in every one of the three places
 * `lib/storage/supabase.ts` demands — and a third drill would mean a third of each. `drill_state`
 * takes them all, and a new drill is a new KEY PREFIX rather than a new schema.
 *
 * ── THE PREFIX, AND WHY IT IS NOT REDUNDANT ──
 * The blob is already per language, so today nothing could collide: only Chinese has
 * handwriting and only Spanish will have conjugation. But `hasHandwriting` is a config flag,
 * not a law — Japanese is a KanjiVG build script away from wanting both at once, and at that
 * point 食 and 食べる:past would be sharing one flat namespace with nothing but luck keeping
 * them apart. Two characters of prefix now is cheaper than a data migration then.
 *
 * ── KEYS WITHOUT A PREFIX ARE HANDWRITING, AND THAT IS THE MIGRATION ──
 * Every key written before this file existed was a bare Han character in `writing_state`. So
 * an unprefixed key is read as `w:` and rewritten on the next save. There is NO version marker
 * and deliberately so: `lib/deckGloss.ts` documents at length why one is a trap — the marker
 * gets written by a run whose result was discarded, and the migration is then marked done
 * having done nothing. The data says what it is, so the data is the migration.
 */

/** One drill's scheduling state — the same subset of FSRS fields a deck word carries. */
export type DrillCard = Schedulable;

/** Every drill card for one language, keyed by PREFIXED id (`w:好`, `c:hablar:pres`). */
export type DrillCards = Record<string, DrillCard>;

/** The whole column, per language then per prefixed key — the same shape as `decks`. */
export type DrillState = Partial<Record<LanguageCode, DrillCards>>;

/**
 * Which drill a card belongs to.
 *
 * `w` handwriting — one card per CHARACTER (see lib/writingState.ts).
 * `c` conjugation — one card per stem-fact or pattern (Phase 6).
 */
export type DrillKind = 'w' | 'c';

const KINDS: readonly DrillKind[] = ['w', 'c'];
const SEP = ':';

/** The stored key for one drill item. */
export function drillKey(kind: DrillKind, id: string): string {
  return kind + SEP + id;
}

/**
 * Split a stored key back into its drill and its id.
 *
 * An unprefixed key is handwriting, because that is the only thing that existed before the
 * prefix did. Note the id may itself contain separators — `c:hablar:pres` is kind `c` and id
 * `hablar:pres` — so this splits on the FIRST separator only.
 */
export function parseDrillKey(key: string): { kind: DrillKind; id: string } {
  const at = key.indexOf(SEP);
  if (at === 1) {
    const kind = key.slice(0, 1) as DrillKind;
    if (KINDS.includes(kind)) return { kind, id: key.slice(at + 1) };
  }
  return { kind: 'w', id: key };
}

/**
 * One drill's cards, with the prefix stripped.
 *
 * Each drill works in its own FLAT namespace — `writingState.ts` deals in bare characters and
 * knows nothing about prefixes, and the conjugation drill will be the same. The namespace is
 * an encoding detail of the stored blob and stops at this boundary.
 */
export function drillView(state: DrillCards, kind: DrillKind): DrillCards {
  const out: DrillCards = {};
  for (const [key, card] of Object.entries(state ?? {})) {
    const p = parseDrillKey(key);
    if (p.kind === kind) out[p.id] = card;
  }
  return out;
}

/**
 * Replace one drill's cards, leaving every OTHER drill's untouched.
 *
 * This is what makes the shared column safe. A handwriting save that wrote the whole blob
 * would delete a Japanese learner's conjugation progress and never mention it — the exact
 * class of loss `SupabaseStorage`'s cold-cache note describes, one layer down.
 */
export function drillWrite(state: DrillCards, kind: DrillKind, cards: DrillCards): DrillCards {
  const out: DrillCards = {};
  for (const [key, card] of Object.entries(state ?? {})) {
    if (parseDrillKey(key).kind !== kind) out[key] = card;
  }
  for (const [id, card] of Object.entries(cards ?? {})) out[drillKey(kind, id)] = card;
  return out;
}

/* ─────────────────────── due-ness and scheduling ──────────────────────── */

/**
 * An unpractised item IS due — the same "absent means due immediately" rule the deck's `dueAt`
 * uses.
 *
 * Unlike the reading queue there is no pause, snooze or leech state to consult. Those exist to
 * protect a DAILY OBLIGATION, and a drill is not one: writing and conjugation are practice you
 * go and do, so being behind on them is not a debt the app has to manage down.
 */
export function isDrillDue(card: DrillCard | undefined, today: string = todayStr()): boolean {
  if (!card) return true;
  return !card.dueAt || card.dueAt <= today;
}

/** Schedule one drill item after an answer. Returns the card to store. */
export function scheduleDrill(
  card: DrillCard | undefined,
  grade: FsrsGrade,
  settings: SrsSettings = DEFAULT_SRS_SETTINGS,
): DrillCard {
  const base: DrillCard = card ?? {};
  return { ...base, ...fsrsSchedule(base, grade, settings, { fuzz: true }) };
}

/* ────────────────────────────── merging ───────────────────────────────── */

/**
 * A CARD IS OWNED WHOLE, NOT MERGED PER FIELD.
 *
 * Stability, difficulty, lapses and due date describe ONE review history, so a per-field
 * maximum composes a state neither device was ever in — the same argument
 * `lib/srsStateMerge.ts` makes about the streak. The later `lastReview` takes the card.
 *
 * Ties fall through to counts and finally to canonical JSON order, because the rule must be
 * COMMUTATIVE and not merely deterministic: a device writes its merged copy back, so "mine
 * wins ties" makes two devices ping-pong for ever, invisibly from either one.
 *
 * There is no deletion to preserve — a drill card only ever comes into existence by being
 * practised — which is what makes a union safe.
 */
export function mergeDrillCards(mine: DrillCards, theirs: DrillCards): DrillCards {
  const out: DrillCards = {};
  for (const key of new Set([...Object.keys(mine ?? {}), ...Object.keys(theirs ?? {})])) {
    const a = mine?.[key], b = theirs?.[key];
    if (!a) { out[key] = b!; continue; }
    if (!b) { out[key] = a; continue; }
    out[key] = ownerOf(a, b);
  }
  return out;
}

/** The card with the better claim to be the real history. Value-only, so it is commutative. */
function ownerOf(a: DrillCard, b: DrillCard): DrillCard {
  const byDate = (a.lastReview ?? '').localeCompare(b.lastReview ?? '');
  if (byDate !== 0) return byDate > 0 ? a : b;
  // Same day on both devices: prefer the one that has done more, since a review is only ever
  // added. Each of these is a count that grows, so "more" is "later" without a clock.
  if ((a.reviews ?? 0) !== (b.reviews ?? 0)) return (a.reviews ?? 0) > (b.reviews ?? 0) ? a : b;
  if ((a.lapses ?? 0) !== (b.lapses ?? 0)) return (a.lapses ?? 0) > (b.lapses ?? 0) ? a : b;
  if ((a.stability ?? 0) !== (b.stability ?? 0)) return (a.stability ?? 0) > (b.stability ?? 0) ? a : b;
  return canonicalJson(a) >= canonicalJson(b) ? a : b;
}

/** The whole column, folded per language. */
export function mergeDrillState(mine: DrillState, theirs: DrillState): DrillState {
  const out: DrillState = {};
  for (const lang of new Set([...Object.keys(mine ?? {}), ...Object.keys(theirs ?? {})]) as Set<LanguageCode>) {
    out[lang] = mergeDrillCards(mine?.[lang] ?? {}, theirs?.[lang] ?? {});
  }
  return out;
}

/* ─────────────────────── device-local persistence ─────────────────────── */

const KEY = (lang: LanguageCode) => `srsly-drill-${lang}`;
/** What handwriting wrote before this file existed. Read once, then rewritten under the new key. */
const LEGACY_KEY = (lang: LanguageCode) => `srsly-writing-${lang}`;

function readObject(key: string): DrillCards | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as DrillCards : null;
  } catch {
    return null;
  }
}

/**
 * Every drill card for a language, prefixes intact.
 *
 * Falls back to the pre-rename handwriting key, whose entries are bare characters —
 * `parseDrillKey` reads those as handwriting, so they need no rewriting to be correct. The old
 * key is deliberately NOT deleted here: a read is not the right place to destroy the only copy
 * of something, and it costs one dead localStorage entry to be able to roll the build back.
 */
export function loadDrill(lang: LanguageCode): DrillCards {
  if (typeof localStorage === 'undefined') return {};
  return readObject(KEY(lang)) ?? readObject(LEGACY_KEY(lang)) ?? {};
}

export function saveDrill(lang: LanguageCode, cards: DrillCards): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY(lang), JSON.stringify(cards)); } catch { /* quota */ }
}
