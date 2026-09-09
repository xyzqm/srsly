import type { DeckWord } from './types';
import { gradeTyped, type TypedResult } from './typedAnswer';
import {
  verbClass, verbCells, verbIndex, factsForVerb, patternCards, cellKey,
  PERSON_ORDER, FINITE_TENSES,
  type GrammarTable, type Tense, type Person, type VerbClass, type StemDelta,
} from './conjugation';

/**
 * Turning conjugation facts into cards a learner sits down and answers.
 *
 * `lib/conjugation.ts` decides WHAT is worth knowing; this decides what a card asks, how it is
 * graded, and which cards a given deck deserves. The split matters because the first half is a
 * claim about Spanish and the second is a claim about teaching.
 *
 * ── ONE CELL PER PROMPT, ONE FACT PER SCHEDULE ──
 * Every review asks for exactly one form — "pedir, present, él/ella" → `pide`. Six boxes on a
 * card cannot be graded Again/Good honestly, and the typed grader already exists for exactly
 * this shape.
 *
 * But the SCHEDULE is per FACT, not per cell, because that is what the knowledge actually is:
 * pedir's e→i change covers eighteen cells and a learner who has it has all eighteen. Per-cell
 * scheduling would turn Spanish conjugation into 5,222 cards — more than the whole of HSK 1–6 —
 * and would keep asking about `pidiendo` as though it were unrelated to `pido`.
 *
 * So a card rotates through its own cells, `cells[reviews % cells.length]`. Deterministic
 * rather than random: the same review always asks the same thing, the rotation covers every
 * cell rather than sampling, and nothing depends on a seed that would have to be stored.
 *
 * ── THE PATTERN IS TAUGHT AS A ROW, THEN TESTED AS A CELL ──
 * A traditional driller tests without teaching. The first time a card comes up it opens in the
 * same Learn state the handwriting canvas uses: the whole six-form row, ungraded, with "Got
 * it, let me try" to start. Nothing is scheduled until an answer is typed.
 *
 * ── ACCENTS ARE NOT TYPOS HERE, AND THAT IS THE ONE PLACE THIS DIVERGES FROM typedAnswer ──
 * See `gradeConjugation`. This is the single most important rule in the file.
 */

export interface DrillCell {
  tense: Tense;
  person: Person;
  form: string;
}

/** A cell to ask for, before it is resolved against any particular verb. */
export interface Slot {
  tense: Tense;
  person: Person;
}

export interface ConjugationCard {
  /**
   * Stable, and stored as the `drill_state` key under the `c:` prefix.
   *
   * `parseDrillKey` splits on the FIRST separator only, so `c:pedir:stem:e>i@1` is kind `c`
   * with id `pedir:stem:e>i@1` — the colons inside are the card's own business.
   */
  id: string;
  kind: 'pattern' | 'exception';
  cls: VerbClass;
  /** Pattern cards and whole-tense exceptions. */
  tense?: Tense;
  /** Stem exceptions — what actually changes. */
  delta?: StemDelta;
  /**
   * THE VERBS THIS CARD CAN BE SHOWN ON, and the reason there is a list rather than a lemma.
   *
   * A pattern card used to pin one exemplar for the life of the card, chosen as the first
   * regular verb in the deck — so every one of the nine `-ar` pattern cards conjugated
   * `ayudar`, every time, for ever. Reported as "it's kind of boring cuz it's always the same
   * word over and over again", which is exactly right and is also a teaching failure: a
   * pattern shown on one verb is indistinguishable from a fact about that verb.
   *
   * So a pattern card carries every regular verb of its class the learner owns and rotates
   * through them. An exception carries exactly one, because an exception IS a fact about its
   * verb and showing it on another would be false.
   */
  exemplars: string[];
  /** The cells this card can ask. Forms come from whichever exemplar is showing. */
  slots: Slot[];
}

/** A card resolved against one exemplar, ready to render. */
export interface MaterialCard {
  lemma: string;
  /** The slots this card asks, with this exemplar's forms. */
  cells: DrillCell[];
  /** One complete tense to read in the Learn state, regular forms included. */
  row: DrillCell[];
}

/* ─────────────────────────────── labels ───────────────────────────────── */

const TENSE_LABEL: Record<Tense, string> = {
  pres: 'present', pret: 'preterite', impf: 'imperfect', fut: 'future',
  cond: 'conditional', pressubj: 'present subjunctive', impsubj: 'imperfect subjunctive',
  gerund: 'gerund', participle: 'past participle',
};

/**
 * PRONOUNS, NOT "1ST PERSON SINGULAR".
 *
 * The learner is being asked to produce a form, and the thing that cues a form in Spanish is
 * the pronoun. Grammatical person is how the table is indexed, not how anyone conjugates.
 */
const PERSON_LABEL: Record<Person, string> = {
  fs: 'yo', ss: 'tú', ts: 'él / ella', fp: 'nosotros', sp: 'vosotros', tp: 'ellos', '': '',
};

export const tenseLabel = (t: Tense) => TENSE_LABEL[t];
export const personLabel = (p: Person) => PERSON_LABEL[p];

/** What the card asks, in words. */
export function promptLabel(lemma: string, cell: DrillCell): string {
  const t = TENSE_LABEL[cell.tense];
  return cell.person ? `${lemma} · ${t} · ${PERSON_LABEL[cell.person]}` : `${lemma} · ${t}`;
}

/** How a stem change reads on a card. */
export function deltaLabel(d: StemDelta): string {
  if (!d.from) return `insert “${d.to}”`;
  if (!d.to) return `drop “${d.from}”`;
  return `“${d.from}” → “${d.to}”`;
}

/* ────────────────────────────── the prompt ────────────────────────────── */

/** A tiny stable hash, so two cards at the same review count do not show the same verb. */
function offsetOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const pick = <T,>(xs: readonly T[], n: number): T =>
  xs[((n % xs.length) + xs.length) % xs.length];

/**
 * Which cell this review asks for.
 *
 * Rotates by review count so a card walks its own cells instead of drilling one for ever.
 * Deterministic on purpose — a random pick would need a stored seed to be reproducible, and
 * without one the same card asks a different thing every render, which is a bug that looks
 * like a shuffle.
 */
export function promptSlot(card: ConjugationCard, reviews: number): Slot {
  return pick(card.slots, reviews);
}

/**
 * Which verb this review shows the pattern on.
 *
 * Offset by the card's own id as well as the review count, so the nine `-ar` pattern cards do
 * not all show the same verb on the same day — which is what made the drill feel like one word
 * repeated rather than a rule applied.
 */
export function exemplarFor(card: ConjugationCard, reviews: number): string {
  return pick(card.exemplars, reviews + offsetOf(card.id));
}

/* ────────────────────────────── grading ───────────────────────────────── */

const stripAccents = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * AN ACCENT IS NOT A TYPO IN A CONJUGATION DRILL, and this is where this file has to disagree
 * with `lib/typedAnswer.ts`.
 *
 * That module forgives a missing accent as a near miss, and it is right to: for vocabulary,
 * `estacion` for `estación` is someone who knows the word and missed a diacritic. Its own
 * docstring gives the test — "whether the mark distinguishes two words".
 *
 * In conjugation it distinguishes two ANSWERS TO DIFFERENT QUESTIONS. `hablo` is the present
 * first person and `habló` is the preterite third; `hable` is the subjunctive and `hablé` the
 * preterite. Measured across the graded vocabulary, 76% of verbs carry at least one such pair
 * and 17% of all cells are involved. Left alone, the existing grader scores `hablo` for
 * `habló` as `close`, which grades GOOD — marking the present tense correct when the preterite
 * was asked, on three quarters of the verbs in the language.
 *
 * So the near miss survives only where it cannot be a confusion: a stripped answer that
 * matches ANOTHER REAL CELL of this same verb is wrong, and a stripped answer that matches
 * nothing else is the ordinary diacritic slip it looks like. The verb's own paradigm decides,
 * which is why `siblings` is passed rather than guessed at.
 */
export function gradeConjugation(
  typed: string,
  expected: string,
  siblings: readonly string[],
): TypedResult {
  const result = gradeTyped(typed, expected, 'es');
  if (result.verdict !== 'close') return result;
  const got = stripAccents(typed);
  const collides = siblings.some(f => f !== expected && stripAccents(f) === got);
  return collides ? { verdict: 'wrong', expected } : result;
}

/* ─────────────────────────── building the deck ────────────────────────── */

/** Used only when the learner owns no regular verb of a class the deck needs. */
const FALLBACK: Record<VerbClass, string> = { ar: 'hablar', er: 'comer', ir: 'vivir' };

function rowFor(table: GrammarTable, lemma: string, tense: Tense): DrillCell[] {
  const cells = verbCells(table, lemma);
  const persons: Person[] = tense === 'gerund' || tense === 'participle' ? [''] : [...PERSON_ORDER];
  const out: DrillCell[] = [];
  for (const person of persons) {
    const form = cells.get(cellKey(tense, person));
    if (form) out.push({ tense, person, form });
  }
  return out;
}

/**
 * Resolve a card against the exemplar this review shows it on.
 *
 * `row` is one COMPLETE tense and is often smaller than `cells`: pedir's e→i spans nineteen
 * cells across five tenses, but it is met in the six-form present, regular forms included, so
 * the change reads as a deviation from something rather than as a list.
 */
export function materialise(
  table: GrammarTable, card: ConjugationCard, reviews: number,
): MaterialCard {
  const lemma = exemplarFor(card, reviews);
  const forms = verbCells(table, lemma);
  const cells: DrillCell[] = [];
  for (const slot of card.slots) {
    const form = forms.get(cellKey(slot.tense, slot.person));
    if (form) cells.push({ ...slot, form });
  }
  const anchor = card.tense ?? cells[0]?.tense ?? card.slots[0]?.tense;
  const row = anchor ? rowFor(table, lemma, anchor) : [];
  return { lemma, cells, row: row.length > 0 ? row : cells };
}

/**
 * Every card this deck earns.
 *
 * ── PATTERNS FIRST, AND ONLY THE ONES THE DECK USES ──
 * The 27 pattern cards are the framework the exceptions hang off, so they are emitted first.
 * They are still SCOPED: a learner with no -ir verbs is not taught the -ir endings, because a
 * pattern with nothing to apply it to is a table to memorise rather than a rule to use.
 *
 * ── EXCEPTIONS COME FROM THE LEARNER'S OWN VERBS ──
 * Not from the graded list. The whole graded vocabulary carries 819 facts; a real deck carries
 * a fraction of that, and a card for a verb you have never met is the hollow progress this
 * codebase refuses elsewhere.
 */
export function buildConjugationCards(
  table: GrammarTable,
  deck: readonly Pick<DeckWord, 'h'>[],
): ConjugationCard[] {
  const index = verbIndex(table);
  const verbs = [...new Set(deck.map(w => w.h.trim().toLowerCase()))]
    .filter(h => verbClass(h) && index.has(h))
    .sort();

  const classes = new Set<VerbClass>(verbs.map(v => verbClass(v)!));
  /** Every regular verb of each class, so a pattern card can rotate rather than repeat. */
  const regulars = new Map<VerbClass, string[]>();
  for (const v of verbs) {
    if (factsForVerb(table, v).length > 0) continue;
    const cls = verbClass(v)!;
    regulars.set(cls, [...(regulars.get(cls) ?? []), v]);
  }

  const out: ConjugationCard[] = [];

  for (const p of patternCards()) {
    if (!classes.has(p.cls)) continue;
    const exemplars = regulars.get(p.cls) ?? [FALLBACK[p.cls]];
    // A pattern with no readable row on any exemplar is not worth a card.
    if (!exemplars.some(v => rowFor(table, v, p.tense).length > 0)) continue;
    const slots: Slot[] = (p.tense === 'gerund' || p.tense === 'participle')
      ? [{ tense: p.tense, person: '' }]
      : PERSON_ORDER.map(person => ({ tense: p.tense, person }));
    out.push({ id: p.key, kind: 'pattern', cls: p.cls, tense: p.tense, exemplars, slots });
  }

  for (const lemma of verbs) {
    for (const fact of factsForVerb(table, lemma)) {
      const slots: Slot[] = fact.cells.map(c => ({ tense: c.tense, person: c.person }));
      if (slots.length === 0) continue;
      out.push({
        id: `${lemma}:${fact.key}`,
        kind: 'exception',
        cls: verbClass(lemma)!,
        tense: fact.tense ?? slots[0].tense,
        delta: fact.delta,
        // Exactly one: an exception IS a fact about its verb, and showing it on another
        // would be false.
        exemplars: [lemma],
        slots,
      });
    }
  }

  return out;
}

/**
 * Keep only the tenses the learner has chosen to practise.
 *
 * An empty or absent choice means ALL — a filter that silences everything is a broken screen,
 * not a preference, and "I have unticked all nine" is far more likely to be a fumble than an
 * intent. A card survives if any of its slots survives, and it then asks only those, so an
 * exception spanning five tenses can still be drilled by someone practising two of them.
 */
export function filterByTenses(
  cards: readonly ConjugationCard[],
  tenses: readonly Tense[] | null | undefined,
): ConjugationCard[] {
  if (!tenses || tenses.length === 0) return [...cards];
  const on = new Set(tenses);
  const out: ConjugationCard[] = [];
  for (const c of cards) {
    const slots = c.slots.filter(s => on.has(s.tense));
    if (slots.length > 0) out.push({ ...c, slots });
  }
  return out;
}

/** Every form this verb has, for the sibling check in `gradeConjugation`. */
export function siblingForms(table: GrammarTable, lemma: string): string[] {
  return [...verbCells(table, lemma).values()];
}

export { FINITE_TENSES };
