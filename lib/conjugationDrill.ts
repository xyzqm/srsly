import type { DeckWord, LanguageCode } from './types';
import { gradeTyped, type TypedResult } from './typedAnswer';
import {
  verbCellsFr, verbIndexFr, factsForVerbFr, verbClassFr, patternCardsFr,
  passeCompose, auxiliaryFor, ETRE_VERBS, TRANSITIVE_SOMETIMES,
} from './conjugationFr';
import {
  verbClass, verbCells, verbIndex, factsForVerb, patternCards, cellKey,
  PERSON_ORDER, FINITE_TENSES,
  type GrammarTable, type Tense, type Person, type StemDelta,
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
  cls: string;
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

/* ────────────────────────────── the engines ───────────────────────────── */

/**
 * The two conjugation engines behind one interface.
 *
 * Spanish reads Wiktionary's tag sets and French reads Lexique's positional codes; French has
 * three regular paradigms and a third group with none at all. Those differences are large
 * enough that the modules are siblings rather than one file with a language argument — but
 * everything ABOVE them, which is the card, the prompt, the rotation and the grading, is
 * genuinely identical. This is that seam.
 *
 * `LanguageConfig.hasConjugation` decides whether a language is offered at all; this decides
 * what answers when it is. A third language is a third entry.
 */
interface Engine {
  cells(table: GrammarTable, lemma: string): ReadonlyMap<string, string>;
  knows(table: GrammarTable, lemma: string): boolean;
  facts(table: GrammarTable, lemma: string): ReturnType<typeof factsForVerb>;
  /** The regular class, or null for a verb that has none. Also the pattern-card grouping. */
  classOf(table: GrammarTable, lemma: string): string | null;
  patterns(): { key: string; cls: string; tense: Tense }[];
  /**
   * Forms that are not IN the table because they are more than one word.
   *
   * Only French has any: the passé composé is `avoir`/`être` plus a participle, so it is
   * composed rather than looked up. Spanish returns nothing, and the card builder below emits
   * no auxiliary cards for it.
   */
  compound(table: GrammarTable, lemma: string): ReadonlyMap<string, string>;
}

const ENGINES: Record<'es' | 'fr', Engine> = {
  es: {
    cells: (t, l) => verbCells(t, l),
    knows: (t, l) => verbClass(l) !== null && verbIndex(t).has(l),
    facts: (t, l) => factsForVerb(t, l),
    classOf: (_t, l) => verbClass(l),
    patterns: () => patternCards(),
    compound: () => new Map(),
  },
  fr: {
    cells: (t, l) => verbCellsFr(t, l),
    // No spelling test: `ouvrir` and `partir` end alike and behave differently, so the table
    // is asked whether it has forms rather than the lemma being pattern-matched.
    knows: (t, l) => (verbIndexFr(t).get(l)?.size ?? 0) > 0,
    facts: (t, l) => factsForVerbFr(t, l),
    classOf: (t, l) => verbClassFr(l, verbCellsFr(t, l)),
    patterns: () => patternCardsFr(),
    compound: (t, l) => {
      const pc = passeCompose(t, l);
      const out = new Map<string, string>();
      if (pc) for (const [person, form] of pc.forms) out.set(cellKey('passecompose', person), form);
      return out;
    },
  },
};

export function engineFor(lang: LanguageCode): Engine | null {
  return lang === 'es' || lang === 'fr' ? ENGINES[lang] : null;
}

/* ─────────────────────────────── labels ───────────────────────────────── */

const TENSE_LABEL: Record<Tense, string> = {
  pres: 'present', pret: 'preterite', impf: 'imperfect', fut: 'future',
  cond: 'conditional', pressubj: 'present subjunctive', impsubj: 'imperfect subjunctive',
  gerund: 'gerund', participle: 'past participle', passecompose: 'passé composé',
};

/**
 * PRONOUNS, NOT "1ST PERSON SINGULAR".
 *
 * The learner is being asked to produce a form, and the thing that cues a form in Spanish is
 * the pronoun. Grammatical person is how the table is indexed, not how anyone conjugates.
 */
const PERSON_LABEL: Record<'es' | 'fr', Record<Person, string>> = {
  es: { fs: 'yo', ss: 'tú', ts: 'él / ella', fp: 'nosotros', sp: 'vosotros', tp: 'ellos', '': '' },
  fr: { fs: 'je', ss: 'tu', ts: 'il / elle', fp: 'nous', sp: 'vous', tp: 'ils', '': '' },
};

/**
 * French calls two of these something else.
 *
 * The gerund slot is the PARTICIPE PRÉSENT (`parlant`), and the past participle is what the
 * passé composé is built from rather than a tense in its own right — so it is named for the
 * job it does. Naming a slot after the language that fills it is the same discipline
 * `lib/uiStrings.ts` keeps for the decorative glyphs.
 */
const TENSE_LABEL_FR: Partial<Record<Tense, string>> = {
  gerund: 'present participle',
  participle: 'past participle',
  pressubj: 'subjunctive',
  impsubj: 'imperfect subjunctive',
};

export const tenseLabel = (t: Tense, lang: LanguageCode = 'es') =>
  (lang === 'fr' ? TENSE_LABEL_FR[t] : undefined) ?? TENSE_LABEL[t];
export const personLabel = (p: Person, lang: LanguageCode = 'es') =>
  PERSON_LABEL[lang === 'fr' ? 'fr' : 'es'][p];

/** What the card asks, in words. */
export function promptLabel(lemma: string, cell: DrillCell, lang: LanguageCode = 'es'): string {
  const t = tenseLabel(cell.tense, lang);
  return cell.person ? `${lemma} · ${t} · ${personLabel(cell.person, lang)}` : `${lemma} · ${t}`;
}

/**
 * `je` BECOMES `j'` BEFORE A VOWEL, and the Learn row is the one place that shows.
 *
 * The pronoun is a label and the form is a separate cell, so a row printed them side by side
 * as "je ai vendu" — which is not French. Elision is the first thing
 * `lib/server/frenchLemmatizer.ts` has to undo when READING French, and this is the same rule
 * running the other way.
 *
 * Only the subject pronoun `je` elides, and only before a vowel or a mute h. The prompt side
 * is left alone: it shows the pronoun on its own as a cue and the learner types the verb, so
 * there is nothing yet to elide against — and eliding there would leak the first letter of
 * the answer.
 */
export function rowPersonLabel(person: Person, lang: LanguageCode, form: string): string {
  const label = personLabel(person, lang);
  if (lang !== 'fr' || person !== 'fs') return label;
  return /^[aeiouâêîôûàèéùïüh]/i.test(form) ? "j'" : label;
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
  lang: LanguageCode = 'es',
): TypedResult {
  const result = gradeTyped(typed, expected, lang);
  if (result.verdict !== 'close') return result;
  const got = stripAccents(typed);
  const collides = siblings.some(f => f !== expected && stripAccents(f) === got);
  return collides ? { verdict: 'wrong', expected } : result;
}

/* ─────────────────────────── building the deck ────────────────────────── */

/** Used only when the learner owns no regular verb of a class the deck needs. */
const FALLBACK: Record<string, string> = {
  ar: 'hablar', er: 'hablar', ir: 'vivir',       // es — `er` is comer, overridden below
  ir2: 'finir', re: 'vendre',                     // fr
};
const FALLBACK_ES: Record<string, string> = { ar: 'hablar', er: 'comer', ir: 'vivir' };
const fallbackFor = (lang: LanguageCode, cls: string) =>
  (lang === 'es' ? FALLBACK_ES[cls] : cls === 'er' ? 'parler' : FALLBACK[cls]) ?? '';

function rowFor(
  engine: Engine, table: GrammarTable, lemma: string, tense: Tense,
): DrillCell[] {
  const cells = tense === 'passecompose'
    ? engine.compound(table, lemma)
    : engine.cells(table, lemma);
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
  table: GrammarTable, card: ConjugationCard, reviews: number, lang: LanguageCode = 'es',
): MaterialCard {
  const engine = engineFor(lang);
  const lemma = exemplarFor(card, reviews);
  if (!engine) return { lemma, cells: [], row: [] };
  const forms = new Map([...engine.cells(table, lemma), ...engine.compound(table, lemma)]);
  const cells: DrillCell[] = [];
  for (const slot of card.slots) {
    const form = forms.get(cellKey(slot.tense, slot.person));
    if (form) cells.push({ ...slot, form });
  }
  const anchor = card.tense ?? cells[0]?.tense ?? card.slots[0]?.tense;
  const row = anchor ? rowFor(engine, table, lemma, anchor) : [];
  return { lemma, cells, row: row.length > 0 ? row : cells };
}

/**
 * Every card this deck earns.
 *
 * ── PATTERNS FIRST, AND ONLY THE ONES THE DECK USES ──
 * The pattern cards are the framework the exceptions hang off, so they are emitted first. They
 * are still SCOPED: a learner with no -ir verbs is not taught the -ir endings, because a
 * pattern with nothing to apply it to is a table to memorise rather than a rule to use.
 *
 * ── EXCEPTIONS COME FROM THE LEARNER'S OWN VERBS ──
 * Not from the graded list. The whole graded vocabulary carries 819 facts in Spanish and 1,059
 * in French; a real deck carries a fraction of that, and a card for a verb you have never met
 * is the hollow progress this codebase refuses elsewhere.
 *
 * ── A FRENCH THIRD-GROUP VERB HAS NO CLASS, AND STILL EARNS CARDS ──
 * `partir` and `aller` contribute no pattern and cannot be a pattern's exemplar, but every one
 * of their tenses is a row to learn. `classOf` returning null is a fact about the verb, not a
 * reason to skip it.
 */
export function buildConjugationCards(
  table: GrammarTable,
  deck: readonly Pick<DeckWord, 'h'>[],
  lang: LanguageCode = 'es',
): ConjugationCard[] {
  const engine = engineFor(lang);
  if (!engine) return [];
  const verbs = [...new Set(deck.map(w => w.h.trim().toLowerCase()))]
    .filter(h => engine.knows(table, h))
    .sort();

  const classes = new Set<string>();
  const regulars = new Map<string, string[]>();
  for (const v of verbs) {
    const cls = engine.classOf(table, v);
    if (!cls) continue;                       // third group: rows only, no pattern
    classes.add(cls);
    if (engine.facts(table, v).length === 0) {
      regulars.set(cls, [...(regulars.get(cls) ?? []), v]);
    }
  }

  const out: ConjugationCard[] = [];

  for (const p of engine.patterns()) {
    if (!classes.has(p.cls)) continue;
    const fallback = fallbackFor(lang, p.cls);
    const exemplars = regulars.get(p.cls) ?? (fallback ? [fallback] : []);
    if (exemplars.length === 0) continue;
    if (!exemplars.some(v => rowFor(engine, table, v, p.tense).length > 0)) continue;
    const slots: Slot[] = (p.tense === 'gerund' || p.tense === 'participle')
      ? [{ tense: p.tense, person: '' }]
      : PERSON_ORDER.map(person => ({ tense: p.tense, person }));
    out.push({ id: p.key, kind: 'pattern', cls: p.cls, tense: p.tense, exemplars, slots });
  }

  /**
   * THE PASSÉ COMPOSÉ: `avoir` IS THE PATTERN, `être` IS THE EXCEPTION LIST.
   *
   * Exactly the shape the rest of this phase uses, and it happens to be how French is taught:
   * almost every verb takes `avoir`, and what has to be learned is the short list that does
   * not. So one pattern card teaches the construction on a regular avoir-verb, and each
   * être-verb the learner owns earns a card of its own.
   *
   * French only — Spanish's compound past exists but its simple preterite is the one a learner
   * needs, and `engine.compound` returns nothing there.
   */
  if (lang === 'fr') {
    const withCompound = verbs.filter(v => engine.compound(table, v).size > 0);
    const avoirVerbs = withCompound.filter(v => auxiliaryFor(v) === 'avoir');
    if (avoirVerbs.length > 0) {
      out.push({
        id: 'pattern:passecompose:avoir',
        kind: 'pattern',
        cls: 'avoir',
        tense: 'passecompose',
        exemplars: avoirVerbs,
        slots: PERSON_ORDER.map(person => ({ tense: 'passecompose' as Tense, person })),
      });
    }
    for (const lemma of withCompound) {
      if (auxiliaryFor(lemma) !== 'être') continue;
      out.push({
        id: `${lemma}:aux:etre`,
        kind: 'exception',
        cls: 'être',
        tense: 'passecompose',
        exemplars: [lemma],
        slots: PERSON_ORDER.map(person => ({ tense: 'passecompose' as Tense, person })),
      });
    }
  }

  for (const lemma of verbs) {
    for (const fact of engine.facts(table, lemma)) {
      const slots: Slot[] = fact.cells.map(c => ({ tense: c.tense, person: c.person }));
      if (slots.length === 0) continue;
      out.push({
        id: `${lemma}:${fact.key}`,
        kind: 'exception',
        cls: engine.classOf(table, lemma) ?? 'irregular',
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
export function siblingForms(
  table: GrammarTable, lemma: string, lang: LanguageCode = 'es',
): string[] {
  const engine = engineFor(lang);
  return engine ? [...engine.cells(table, lemma).values()] : [];
}

/** Whether this card is about the auxiliary rather than about an ending. */
export function isAuxiliaryCard(card: ConjugationCard): boolean {
  return card.tense === 'passecompose';
}

/** What an auxiliary card should say about itself, if anything. */
export function auxiliaryNote(lemma: string): string | null {
  if (!ETRE_VERBS.has(lemma)) return null;
  return TRANSITIVE_SOMETIMES.has(lemma)
    ? 'Takes être with no direct object — but avoir when it has one.'
    : 'One of the être verbs. The participle agrees with the subject.';
}

export { FINITE_TENSES, ETRE_VERBS, auxiliaryFor };
